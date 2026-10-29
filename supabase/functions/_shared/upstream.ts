// Outside services (routing, search, Overpass, weather) go through here, as a pool.
//
// Every service has a list of providers: Blacktop's own geo server (infra/geo) when it's
// set up, the public servers, and keyed free tiers when their key is set as a secret.
// Each call goes to the best provider for that moment and the rest are the fallbacks:
//
// - Health. Each provider's answer time is followed (a running average), and a failure
//   rests it: 30 s, doubling with each failure in a row, ten minutes at most (our own
//   server a minute, as it always was). A provider that's resting is still tried last,
//   so nothing is ever unavailable while anything might answer.
// - Load. A keyed provider has a daily (and per-minute) allowance. Calls are counted
//   here, and where the provider says what's left (rate-limit headers) that's believed
//   instead. Past 60 % of an allowance it's ranked steadily lower, so new calls move to
//   the others well before it's used up; at 95 % it's left out until the next day, and
//   a 429 rests it until its allowance comes back.
// - Spread. Providers close in speed share the calls (a little jitter in the ranking),
//   so one public server isn't leant on while another sits idle.
// - Backup requests. If the first provider hasn't answered by about twice its usual time,
//   the next one is asked as well and the first answer wins (the other is cancelled).
//   Only to a provider with room to spare, and never more than two at once.
//
// The counts live in the function's memory, so they're per running copy and start again
// when it restarts: the allowances are kept loosely, which is why the cut-off is 95 %
// and providers' own headers are preferred. Nothing about who asked ever goes to a provider.
//
// Our own server is used when two secrets are set: GEO_SERVER_URL (e.g.
// https://geo.blacktoplive.com) and GEO_SERVER_TOKEN, each service under its own path
// (/valhalla, /photon, /overpass, /weather, /spots). A third, GEO_SERVICES, lists what it
// runs (e.g. "valhalla,photon,weather,spots"); without it it's taken to run them all.
// Keyed providers are listed in KEYED below, each switched on by its own secret.

const env = (k: string): string => {
  // Deno in the Edge Functions; the local scripts run on Node.
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } }; process?: { env: Record<string, string | undefined> } };
  return (g.Deno?.env.get(k) ?? g.process?.env?.[k] ?? "").trim();
};

const GEO_URL = env("GEO_SERVER_URL").replace(/\/+$/, "");
const GEO_TOKEN = env("GEO_SERVER_TOKEN");
const GEO_SERVICES = env("GEO_SERVICES").toLowerCase().split(/[\s,]+/).filter(Boolean);

/** `spots`: the weekly extract of cameras and scenic spots (infra/geo/build-spots.sh), static files by map cell. */
export type GeoService = "valhalla" | "osrm" | "photon" | "overpass" | "weather" | "spots" | "nominatim";

/**
 * One server that can answer for a service. `kind` says which API it speaks when that
 * isn't the service's own (a keyed provider in another shape); calls switch on it.
 */
export interface Provider {
  id: string;
  base: string;
  own?: boolean;
  kind?: string;
  /** The key, for a keyed provider (sent the way its `kind` needs). */
  key?: string;
  /** Its free allowance: calls a day, and a minute. */
  daily?: number;
  perMinute?: number;
  /** The credit a provider's terms ask for, shown with what it answered. */
  credit?: string;
}

/** What a call is told about the provider it's asking. Pass it to fetchWithTimeout as `hop`. */
export interface Hop {
  provider: Provider;
  own: boolean;
  signal: AbortSignal;
}

/**
 * Keyed free tiers whose terms allow an app like Blacktop to use them (checked 2026-10-29:
 * commercial use allowed on the free plan, with a credit). Each is off until its secret is
 * set. One account each: never several accounts for one provider to stretch a free tier.
 */
const KEYED: Array<{ service: GeoService; secret: string; provider: Omit<Provider, "key"> }> = [
  // Nominatim's own API, so search and reverse read it unchanged. 5,000 a day, 60 a minute.
  {
    service: "nominatim",
    secret: "LOCATIONIQ_KEY",
    provider: { id: "locationiq", base: "https://eu1.locationiq.com/v1", kind: "locationiq", daily: 5000, perMinute: 60, credit: "Search by LocationIQ.com" },
  },
  // Geoapify's geocoder, turned into Nominatim's shape. 3,000 credits a day, 5 a second.
  {
    service: "nominatim",
    secret: "GEOAPIFY_KEY",
    provider: { id: "geoapify", base: "https://api.geoapify.com/v1/geocode", kind: "geoapify", daily: 3000, perMinute: 300, credit: "Powered by Geoapify" },
  },
];

const USER_AGENT = "Blacktop/1.0 (https://blacktoplive.com)";

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** For the scripts: send every upstream call through a throttle or a stand-in. */
export function setUpstreamFetch(f: typeof fetch) {
  fetchImpl = f;
}
let now = () => Date.now();
let random = () => Math.random();
/** For the check script: a clock and dice it controls. */
export function setUpstreamClock(clock: () => number, dice: () => number = Math.random) {
  now = clock;
  random = dice;
}

/** A provider said its allowance is used up (429, or a quota answer). */
export class QuotaError extends Error {
  constructor(message: string, readonly retryAfterMs: number | null) {
    super(message);
  }
}

/**
 * fetch with a time limit. With `hop` (what viaGeo hands each call) it's also cancelled when
 * the pool no longer needs it, the provider's rate-limit headers are read, and a 429 throws
 * a QuotaError so the provider is rested until its allowance comes back.
 */
export async function fetchWithTimeout(url: string, init: RequestInit & { hop?: Hop }, timeoutMs: number) {
  const { hop, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  hop?.signal.addEventListener("abort", cancel);
  try {
    const res = await fetchImpl(url, { ...rest, signal: controller.signal });
    if (hop) {
      noteHeaders(hop.provider, res.headers);
      if (res.status === 429) {
        const after = Number(res.headers.get("retry-after"));
        throw new QuotaError(`${hop.provider.id} 429`, Number.isFinite(after) && after > 0 ? after * 1000 : null);
      }
    }
    return res;
  } finally {
    clearTimeout(t);
    hop?.signal.removeEventListener("abort", cancel);
  }
}

/** Headers for an upstream call: a contactable User-Agent, and our token when it's our server. */
export function upstreamHeaders(own: boolean, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    ...extra,
    ...(own && GEO_TOKEN ? { Authorization: `Bearer ${GEO_TOKEN}` } : {}),
  };
}

/** Whether our server is configured (at all) for this deployment. */
export const hasOwnGeoServer = GEO_URL !== "";
/** Whether our server runs this service (it's configured, and GEO_SERVICES lists it or isn't set). */
export const hasOwn = (service: GeoService): boolean => hasOwnGeoServer && (GEO_SERVICES.length === 0 || GEO_SERVICES.includes(service));

/** The keyed providers switched on for a service (their secrets set). */
export function keyedProviders(service: GeoService): Provider[] {
  return KEYED.filter((k) => k.service === service && env(k.secret)).map((k) => ({ ...k.provider, key: env(k.secret) }));
}

// ---- Health -----------------------------------------------------------------------

interface Health {
  /** Running average of answer times, ms (null until it has answered). */
  avgMs: number | null;
  failsInRow: number;
  restUntil: number;
  day: number;
  dayCalls: number;
  minute: number;
  minuteCalls: number;
  /** What the provider itself last said is left, and of how many (rate-limit headers). */
  left: number | null;
  limit: number | null;
  inFlight: number;
}

const health = new Map<string, Health>();
const PRIOR_MS = 1200;
const REST_MS = 30_000;
const OWN_REST_MS = 60_000;
const MAX_REST_MS = 10 * 60_000;
/** Where a provider starts being ranked lower, and where it's left out. */
const BUSY = 0.6;
const FULL = 0.95;

function healthOf(p: Provider): Health {
  let h = health.get(p.id);
  if (!h) {
    h = { avgMs: null, failsInRow: 0, restUntil: 0, day: 0, dayCalls: 0, minute: 0, minuteCalls: 0, left: null, limit: null, inFlight: 0 };
    health.set(p.id, h);
  }
  const t = now();
  const day = Math.floor(t / 86_400_000);
  const minute = Math.floor(t / 60_000);
  if (h.day !== day) {
    h.day = day;
    h.dayCalls = 0;
    h.left = null;
    h.limit = null;
  }
  if (h.minute !== minute) {
    h.minute = minute;
    h.minuteCalls = 0;
  }
  return h;
}

/** How much of its allowance a provider has used, 0 to 1 (0 for one without an allowance). */
export function usedShare(p: Provider): number {
  const h = healthOf(p);
  let share = 0;
  if (p.daily) share = Math.max(share, h.dayCalls / p.daily);
  if (p.perMinute) share = Math.max(share, (h.minuteCalls + h.inFlight) / p.perMinute);
  if (h.left !== null && h.limit) share = Math.max(share, 1 - h.left / h.limit);
  return share;
}

function noteHeaders(p: Provider, headers: Headers) {
  const left = Number(headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining") ?? NaN);
  const limit = Number(headers.get("x-ratelimit-limit") ?? headers.get("ratelimit-limit") ?? NaN);
  if (Number.isFinite(left) && Number.isFinite(limit) && limit > 0) {
    const h = healthOf(p);
    h.left = left;
    h.limit = limit;
  }
}

function noteAnswer(p: Provider, ms: number) {
  const h = healthOf(p);
  h.avgMs = h.avgMs === null ? ms : h.avgMs * 0.7 + ms * 0.3;
  h.failsInRow = 0;
  h.restUntil = 0;
}

function noteFailure(p: Provider, ms: number, e: unknown) {
  const h = healthOf(p);
  h.failsInRow++;
  // A slow failure (a timeout) also says it's slow.
  h.avgMs = h.avgMs === null ? ms : h.avgMs * 0.7 + ms * 0.3;
  let rest = p.own ? OWN_REST_MS : Math.min(MAX_REST_MS, REST_MS * 2 ** (h.failsInRow - 1));
  if (e instanceof QuotaError) {
    // Out of allowance: until it says to try again, or the next day if it has a daily one.
    const nextDay = (Math.floor(now() / 86_400_000) + 1) * 86_400_000 - now();
    rest = e.retryAfterMs ?? (p.daily ? nextDay : REST_MS);
    if (p.daily) h.dayCalls = Math.max(h.dayCalls, p.daily);
  }
  h.restUntil = now() + rest;
}

/**
 * A provider's place in the queue: smaller first. Ours first; resting and full ones last.
 * One never timed yet is taken to be as quick as the best known (`prior`), so it gets
 * tried and the calls can spread to it; a fixed guess left new providers idle for good.
 */
function rank(p: Provider, prior: number): number {
  const h = healthOf(p);
  if (h.restUntil > now()) return 1e9 + h.restUntil;
  const share = usedShare(p);
  if (share >= FULL) return 2e9;
  const busy = share > BUSY ? 1 + 10 * ((share - BUSY) / (1 - BUSY)) ** 2 : 1;
  if (p.own) return -1e6 + (h.avgMs ?? prior);
  return (h.avgMs ?? prior) * busy * (0.85 + 0.3 * random());
}

/** The order the providers would be asked in now (for the check script and logs). */
export function poolOrder(providers: Provider[]): Provider[] {
  const known = providers.map((p) => healthOf(p).avgMs).filter((ms): ms is number => ms !== null);
  const prior = known.length ? Math.min(...known) : PRIOR_MS;
  return providers.map((p) => ({ p, r: rank(p, prior) })).sort((a, b) => a.r - b.r).map((x) => x.p);
}

/** Forget every provider's health (for the check script). */
export function resetPool() {
  health.clear();
}

// ---- The pool ---------------------------------------------------------------------

export interface PoolResult<T> {
  value: T;
  provider: Provider;
}

/**
 * Asks the providers for `service` in their best order until one answers. A resolved value
 * (including null for "no result") is an answer; only a throw moves on. If the first is slow,
 * the next is asked alongside it (see the top of the file). `hedge: false` for calls too
 * big to send twice.
 */
export async function viaPool<T>(
  service: string,
  providers: Provider[],
  call: (base: string, own: boolean, hop: Hop) => Promise<T>,
  opts: { hedge?: boolean } = {},
): Promise<PoolResult<T>> {
  const queue = poolOrder(providers);
  if (!queue.length) throw new Error(`${service} unavailable`);
  const hedge = opts.hedge !== false;
  return new Promise<PoolResult<T>>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let lastError: unknown = null;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
    const controllers: AbortController[] = [];

    const finish = () => {
      done = true;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      for (const c of controllers) c.abort();
    };

    const launch = () => {
      if (done || next >= queue.length) {
        if (!done && running === 0) {
          finish();
          reject(lastError ?? new Error(`${service} unavailable`));
        }
        return;
      }
      const p = queue[next++];
      const h = healthOf(p);
      const c = new AbortController();
      controllers.push(c);
      running++;
      h.inFlight++;
      h.dayCalls++;
      h.minuteCalls++;
      const started = now();
      // Ask the next one too if this one runs past twice its usual time.
      if (hedge && hedgeTimer === null) {
        const after = Math.min(4000, Math.max(800, 2 * (h.avgMs ?? PRIOR_MS)));
        hedgeTimer = setTimeout(() => {
          hedgeTimer = null;
          const spare = queue[next];
          if (!done && running < 2 && spare && healthOf(spare).restUntil <= now() && usedShare(spare) < BUSY) launch();
        }, after);
      }
      call(p.base, p.own === true, { provider: p, own: p.own === true, signal: c.signal }).then(
        (value) => {
          running--;
          h.inFlight--;
          noteAnswer(p, now() - started);
          if (done) return;
          finish();
          resolve({ value, provider: p });
        },
        (e) => {
          running--;
          h.inFlight--;
          // Cancelled by us because another answered first: not the provider's fault.
          if (done && c.signal.aborted) return;
          noteFailure(p, now() - started, e);
          lastError = e;
          if (p.own) console.warn(`[geo] own ${service} failed, using the next:`, e instanceof Error ? e.message : e);
          if (done) return;
          if (hedgeTimer) {
            clearTimeout(hedgeTimer);
            hedgeTimer = null;
          }
          // Straight on to the next (unless a backup request is already out).
          if (running === 0 || next < queue.length) launch();
        },
      );
    };

    launch();
  });
}

/** The providers for a service: ours (when it runs it), the public bases, then any keyed ones. */
export function providersFor(service: GeoService, publicBases: string[], extra: Provider[] = []): Provider[] {
  const list: Provider[] = [];
  if (hasOwn(service)) list.push({ id: `own:${service}`, base: `${GEO_URL}/${service}`, own: true });
  for (const base of publicBases) list.push({ id: base, base });
  return [...list, ...extra];
}

/**
 * Runs `call` against our server's `service` first (when it runs it), then the public bases
 * and keyed providers by the pool's ranking. Returns the value alone; viaPool also says who answered.
 */
export async function viaGeo<T>(
  service: GeoService,
  publicBases: string[],
  call: (base: string, own: boolean, hop: Hop) => Promise<T>,
  opts: { hedge?: boolean } = {},
): Promise<T> {
  return (await viaPool(service, providersFor(service, publicBases), call, opts)).value;
}
