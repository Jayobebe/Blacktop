// npm run upstream:check — the provider pool in supabase/functions/_shared/upstream.ts, played with
// made-up providers: fast and slow, failing, rate-limited, out of allowance, hanging, and the
// geocoder's keyed providers answering in their own shapes. Runs on the real clock (backup requests
// are timed), with the pool's own clock pushed forward for rests and days. About ten seconds.
process.env.LOCATIONIQ_KEY = "liq-test";
process.env.GEOAPIFY_KEY = "ga-test";

import { QuotaError, poolOrder, resetPool, setUpstreamClock, setUpstreamFetch, usedShare, viaPool, fetchWithTimeout, type Provider } from "../supabase/functions/_shared/upstream.ts";
import { geocodeReverse, geocodeSearch } from "../supabase/functions/place-search/geocode.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

let shift = 0;
setUpstreamClock(() => Date.now() + shift);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A made-up provider's behaviour: how long it takes, and what it does. */
type Act = { ms: number; fail?: boolean; status?: number; retryAfter?: number; value?: unknown };
const acts = new Map<string, () => Act>();
const asked: string[] = [];
const aborted: string[] = [];

setUpstreamFetch(async (input, init) => {
  const url = new URL(String(input));
  const id = url.hostname;
  asked.push(id);
  const act: Act = (acts.get(id) ?? (() => ({ ms: 10 })))();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, act.ms);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      aborted.push(id);
      reject(new Error("aborted"));
    });
  });
  const headers = new Headers({ "content-type": "application/json" });
  if (act.retryAfter) headers.set("retry-after", String(act.retryAfter));
  return new Response(JSON.stringify(act.value ?? { from: id }), { status: act.status ?? (act.fail ? 500 : 200), headers });
});

const P = (id: string, extra: Partial<Provider> = {}): Provider => ({ id, base: `https://${id}`, ...extra });
const ask = (providers: Provider[], opts?: { hedge?: boolean }) =>
  viaPool("test", providers, async (base, _own, hop) => {
    const res = await fetchWithTimeout(`${base}/x`, { hop }, 6000);
    if (!res.ok) throw new Error(`${hop.provider.id} ${res.status}`);
    return res.json();
  }, opts);

function fresh() {
  resetPool();
  acts.clear();
  asked.length = 0;
  aborted.length = 0;
  shift = 0;
}

// 1. The faster of two ends up with most of the calls.
{
  fresh();
  const a = P("fast"), b = P("slow");
  acts.set("fast", () => ({ ms: 15 }));
  acts.set("slow", () => ({ ms: 120 }));
  // Each is asked once alone to learn its speed.
  await ask([b], { hedge: false });
  await ask([a], { hedge: false });
  asked.length = 0;
  for (let i = 0; i < 30; i++) await ask([a, b]);
  const fastShare = asked.filter((x) => x === "fast").length / asked.length;
  check("the faster provider takes most calls", fastShare > 0.9, `${Math.round(fastShare * 100)} %`);
}

// 2. Close in speed: the calls are shared.
{
  fresh();
  const a = P("a"), b = P("b");
  acts.set("a", () => ({ ms: 40 }));
  acts.set("b", () => ({ ms: 42 }));
  for (let i = 0; i < 60; i++) await ask([a, b]);
  const aShare = asked.filter((x) => x === "a").length / asked.length;
  check("two providers of a speed share the calls", aShare > 0.25 && aShare < 0.75, `a ${Math.round(aShare * 100)} %`);
}

// 3. A failure moves on at once, rests the provider, and it's tried again after its rest.
{
  fresh();
  const a = P("down"), b = P("up");
  acts.set("up", () => ({ ms: 40 }));
  await ask([a], { hedge: false }); // known to be quick
  await ask([b], { hedge: false });
  acts.set("down", () => ({ ms: 5, fail: true }));
  asked.length = 0;
  const r = await ask([a, b]);
  check("a failure falls through to the next", r.provider.id === "up" && asked.join() === "down,up", asked.join());
  asked.length = 0;
  await ask([a, b]);
  check("a provider that failed is rested", asked[0] === "up", asked.join());
  shift = 31_000;
  acts.set("down", () => ({ ms: 5 }));
  asked.length = 0;
  await ask([a, b]);
  check("after its rest it's asked again", asked[0] === "down", asked.join());
}

// 4. Rests grow with failures in a row, to ten minutes at most.
{
  fresh();
  const a = P("flaky"), b = P("steady");
  acts.set("steady", () => ({ ms: 200 }));
  await ask([b], { hedge: false });
  await ask([a], { hedge: false }); // known to be quick, so it's asked first each time
  acts.set("flaky", () => ({ ms: 5, fail: true }));
  for (let i = 0; i < 8; i++) {
    shift += 11 * 60_000; // past any rest, so it's tried first each time
    await ask([a, b]);
  }
  shift += 9 * 60_000;
  check("a provider failing again and again rests ten minutes", poolOrder([a, b])[0].id === "steady");
  shift += 61_000;
  check("…and no longer", poolOrder([a, b])[0].id === "flaky");
}

// 5. An allowance: ranked lower past 60 %, left out at 95 %, counted again the next day.
{
  fresh();
  const keyed = P("keyed", { daily: 100 });
  const free = P("free");
  acts.set("keyed", () => ({ ms: 10 }));
  acts.set("free", () => ({ ms: 40 }));
  await ask([free], { hedge: false });
  for (let i = 0; i < 50; i++) await ask([keyed], { hedge: false });
  check("under 60 % the faster keyed provider still leads", poolOrder([keyed, free])[0].id === "keyed", `used ${usedShare(keyed)}`);
  for (let i = 0; i < 40; i++) await ask([keyed], { hedge: false });
  check("near its allowance it gives way", poolOrder([keyed, free])[0].id === "free", `used ${usedShare(keyed)}`);
  for (let i = 0; i < 5; i++) await ask([keyed], { hedge: false });
  check("at 95 % it's left for last", poolOrder([keyed, free]).at(-1)?.id === "keyed");
  shift += 86_400_000;
  check("the next day it's counted from nothing", usedShare(keyed) === 0 && poolOrder([keyed, free])[0].id === "keyed");
}

// 6. A per-minute allowance spreads a burst.
{
  fresh();
  const nom = P("nom", { perMinute: 20 });
  const other = P("other");
  acts.set("nom", () => ({ ms: 10 }));
  acts.set("other", () => ({ ms: 25 }));
  for (let i = 0; i < 40; i++) await ask([nom, other]);
  const nomCount = asked.filter((x) => x === "nom").length;
  check("a burst past a per-minute allowance spills over", nomCount >= 10 && nomCount <= 20, `${nomCount} of 40 to the limited one`);
}

// 7. 429: rested for as long as it says, or to the next day for a daily allowance.
{
  fresh();
  const a = P("limited"), b = P("spare");
  acts.set("spare", () => ({ ms: 120 }));
  await ask([a], { hedge: false });
  await ask([b], { hedge: false });
  acts.set("limited", () => ({ ms: 5, status: 429, retryAfter: 120 }));
  const r = await ask([a, b]);
  check("a 429 falls through", r.provider.id === "spare");
  shift = 100_000;
  check("…rests it as long as Retry-After says", poolOrder([a, b])[0].id === "spare");
  shift = 125_000;
  check("…and no longer", poolOrder([a, b])[0].id === "limited");
  fresh();
  const d = P("daily", { daily: 1000 });
  acts.set("spare", () => ({ ms: 120 }));
  await ask([d], { hedge: false });
  await ask([b], { hedge: false }); // timed (slower), so the 429ing one is asked first
  acts.set("daily", () => ({ ms: 5, status: 429 }));
  await ask([d, b]);
  const toMidnight = (Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000 - Date.now();
  shift = toMidnight - 60_000;
  check("a daily allowance used up rests until the day changes", poolOrder([d, b])[0].id === "spare");
  shift = toMidnight + 60_000;
  check("…and is back once it has", poolOrder([d, b])[0].id === "daily");
}

// 8. A hanging provider: the next is asked alongside it, the first answer wins, the other is cancelled.
{
  fresh();
  const hang = P("hang"), quick = P("quick");
  await ask([hang], { hedge: false }); // known to be quick, so it's asked first
  acts.set("quick", () => ({ ms: 300 }));
  await ask([quick], { hedge: false });
  acts.set("quick", () => ({ ms: 30 }));
  acts.set("hang", () => ({ ms: 5000 }));
  acts.set("quick", () => ({ ms: 30 }));
  const t0 = Date.now();
  const r = await ask([hang, quick]);
  const took = Date.now() - t0;
  check("a hanging provider is backed up", r.provider.id === "quick" && took < 3000, `${took} ms`);
  check("…and its request is cancelled", aborted.includes("hang"));
}

// 9. No backup requests when asked not to: one at a time, in order.
{
  fresh();
  const slow = P("slowonly"), next = P("nextonly");
  await ask([slow], { hedge: false });
  acts.set("nextonly", () => ({ ms: 300 }));
  await ask([next], { hedge: false });
  asked.length = 0;
  acts.set("slowonly", () => ({ ms: 2600 }));
  const r = await ask([slow, next], { hedge: false });
  check("hedge: false asks one at a time", r.provider.id === "slowonly" && !asked.includes("nextonly"), asked.join());
}

// 10. "No result" (a null) is an answer; everything failing is an error.
{
  fresh();
  const a = P("none"), b = P("never");
  let calls = 0;
  const r = await viaPool("test", [a, b], async () => {
    calls++;
    return null;
  });
  check("a null answer is an answer", r.value === null && calls === 1);
  let threw = false;
  try {
    await viaPool("test", [a, b], async (_b, _o, hop) => {
      throw new Error(`${hop.provider.id} down`);
    });
  } catch (e) {
    threw = e instanceof Error && /down/.test(e.message);
  }
  check("every provider failing is an error", threw);
}

// 11. Our own server goes first even when it's slower.
{
  fresh();
  const own = P("own", { own: true }), pub = P("pub");
  acts.set("own", () => ({ ms: 60 }));
  acts.set("pub", () => ({ ms: 10 }));
  for (let i = 0; i < 5; i++) await ask([pub, own], { hedge: false });
  check("our own server goes first", asked.every((x) => x === "own"), asked.join());
}

// 12. QuotaError carries Retry-After.
check("QuotaError keeps its wait", new QuotaError("x", 5000).retryAfterMs === 5000);

// 13. The geocoder: Nominatim refusing (403) moves to a keyed provider, whose credit comes back with it.
{
  fresh();
  acts.set("nominatim.openstreetmap.org", () => ({ ms: 5, status: 403 }));
  acts.set("eu1.locationiq.com", () => ({ ms: 15, value: [{ place_id: 1, lat: "51.5", lon: "-0.1", display_name: "Somewhere, London", name: "Somewhere" }] }));
  acts.set("api.geoapify.com", () => ({ ms: 5, status: 500 }));
  const s = await geocodeSearch({ q: "somewhere", viewbox: "-0.2,51.4,0.0,51.6", bounded: "1", limit: 5 });
  check("search moves past a refusing Nominatim", s.results[0]?.name === "Somewhere", JSON.stringify(s.results[0]));
  check("…and carries the provider's credit", s.credit === "Search by LocationIQ.com", String(s.credit));
}

// 14. Geoapify's answers in Nominatim's shape.
{
  fresh();
  acts.set("nominatim.openstreetmap.org", () => ({ ms: 5, status: 503 }));
  acts.set("eu1.locationiq.com", () => ({ ms: 5, status: 500 }));
  acts.set("api.geoapify.com", () => ({
    ms: 10,
    value: {
      results: [{
        place_id: "abc", lat: 50.82, lon: -0.14, name: "Brighton Pier", formatted: "Brighton Pier, Madeira Drive, Brighton, BN2 1TW, United Kingdom",
        category: "tourism.attraction", city: "Brighton", county: "East Sussex", country_code: "GB", street: "Madeira Drive", postcode: "BN2 1TW",
      }],
    },
  }));
  const s = await geocodeSearch({ q: "brighton pier", countryCode: "gb", limit: 3 });
  const g = s.results[0];
  check("Geoapify search reads as Nominatim", g?.lat === "50.82" && g?.lon === "-0.14" && g?.name === "Brighton Pier" && g?.class === "tourism" && /Madeira/.test(g?.display_name ?? ""), JSON.stringify(g));
  check("…with Geoapify's credit", s.credit === "Powered by Geoapify");
  const r = await geocodeReverse(50.82, -0.14, 12);
  check("Geoapify reverse gives the town and country", r.place?.address?.city === "Brighton" && r.place?.address?.country_code === "gb", JSON.stringify(r.place?.address));
}

// 15. LocationIQ's "nothing found" (404) is an answer, not an outage.
{
  fresh();
  acts.set("nominatim.openstreetmap.org", () => ({ ms: 5, status: 403 }));
  acts.set("eu1.locationiq.com", () => ({ ms: 5, status: 404, value: { error: "Unable to geocode" } }));
  acts.set("api.geoapify.com", () => ({ ms: 5, status: 500 }));
  const s = await geocodeSearch({ q: "zzzz" });
  check("LocationIQ's 404 means no results", s.results.length === 0 && s.credit === "Search by LocationIQ.com");
}

await sleep(0);
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
