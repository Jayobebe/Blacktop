// Outside services (routing, search, Overpass, weather) go through here.
//
// Blacktop's own geo server (infra/geo) is used when two Edge Function secrets
// are set: GEO_SERVER_URL (e.g. https://geo.blacktoplive.com) and
// GEO_SERVER_TOKEN. Each service lives under its own path on it (/valhalla,
// /photon, /overpass, /weather). If a call to ours fails (down, rebuilding, or
// that service not installed), it falls back to the public service and ours is
// skipped for that service for a minute, so an outage costs one slow request,
// not one per call.

const env = (k: string): string => {
  // Deno in the Edge Functions; the local evaluation script runs on Node.
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } };
  return (g.Deno?.env.get(k) ?? "").trim();
};

const GEO_URL = env("GEO_SERVER_URL").replace(/\/+$/, "");
const GEO_TOKEN = env("GEO_SERVER_TOKEN");
const REST_MS = 60_000;
const restingUntil: Record<string, number> = {};

export type GeoService = "valhalla" | "osrm" | "photon" | "overpass" | "weather";

const USER_AGENT = "Blacktop/1.0 (https://blacktoplive.com)";

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** For the evaluation script: send every upstream call through a throttle. */
export function setUpstreamFetch(f: typeof fetch) {
  fetchImpl = f;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
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

/**
 * Runs `call` against our server's `service` first (unless it's resting), then
 * each public base in turn. A resolved value (including null for "no result")
 * is an answer; only a throw moves on to the next server.
 */
export async function viaGeo<T>(
  service: GeoService,
  publicBases: string[],
  call: (base: string, own: boolean) => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;
  if (GEO_URL && (restingUntil[service] ?? 0) < Date.now()) {
    try {
      return await call(`${GEO_URL}/${service}`, true);
    } catch (e) {
      restingUntil[service] = Date.now() + REST_MS;
      lastError = e;
      console.warn(`[geo] own ${service} failed, using the public one:`, e instanceof Error ? e.message : e);
    }
  }
  for (const base of publicBases) {
    try {
      return await call(base, false);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`${service} unavailable`);
}
