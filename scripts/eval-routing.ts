// Compares the twisty and loop planners on OSRM and on Valhalla, using the
// Edge Function's own code (supabase/functions/place-search/routing.ts).
//
//   npm run routing:eval             (public demo servers: throttled, a few minutes)
//   npm run routing:eval -- --only=keswick,asheville --engine=valhalla,both
//   GEO_SERVER_URL=… GEO_SERVER_TOKEN=… npm run routing:eval   (your own server)
//
// Both engines get the same requests (loops use the same seeded shapes). Each
// engine's pick is then judged the same way: its line map-matched on Valhalla
// and scored on the real road data (rural bends per km; motorway, town and
// gravel shares; road ridden twice), plus how much longer it takes than the
// direct ride. Keep runs occasional: the public servers are shared.

import {
  analyseStretches,
  buildLoop,
  buildTwisty,
  type EngineName,
  type LngLat,
  readPrefs,
  type RouteAnalysis,
  type Vibe,
  valhallaStretches,
} from "../supabase/functions/place-search/routing.ts";
import { setUpstreamFetch } from "../supabase/functions/_shared/upstream.ts";

// One request at a time per host, ~1 a second. The callers' timeouts would
// start ticking while a request waits its turn here, so they're dropped (the
// servers get 30 s once it's sent).
const lastAt = new Map<string, Promise<unknown>>();
setUpstreamFetch(((input: RequestInfo | URL, init?: RequestInit) => {
  const host = new URL(String(input)).host;
  const prev = lastAt.get(host) ?? Promise.resolve();
  const run = prev.then(() => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }));
  lastAt.set(host, run.catch(() => undefined).then(() => new Promise((s) => setTimeout(s, 1050))));
  return run;
}) as typeof fetch);

type Case =
  | { kind: "twisty"; name: string; from: LngLat; to: LngLat }
  | { kind: "loop"; name: string; at: LngLat; km: number; vibe: Vibe; seed: number };

const CASES: Case[] = [
  { kind: "twisty", name: "Buxton → Leek (Peak District)", from: [-1.9110, 53.2587], to: [-2.0226, 53.1047] },
  { kind: "twisty", name: "Brecon → Llandovery (Wales)", from: [-3.3900, 51.9460], to: [-3.7960, 51.9950] },
  { kind: "twisty", name: "Keswick → Kendal (Lakes)", from: [-3.1340, 54.6010], to: [-2.7460, 54.3280] },
  { kind: "twisty", name: "Pitlochry → Braemar (Highlands)", from: [-3.7340, 56.7040], to: [-3.3960, 57.0060] },
  { kind: "twisty", name: "Annecy → Albertville (Alps)", from: [6.1290, 45.8990], to: [6.3920, 45.6760] },
  { kind: "twisty", name: "Asheville → Maggie Valley (Blue Ridge)", from: [-82.5515, 35.5951], to: [-83.0977, 35.5182] },
  { kind: "loop", name: "Matlock 80 km curvy loop", at: [-1.5540, 53.1380], km: 80, vibe: "curvy", seed: 7 },
  { kind: "loop", name: "Hay-on-Wye 100 km relaxed loop", at: [-3.1250, 52.0740], km: 100, vibe: "relaxed", seed: 11 },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prefs = readPrefs({});

/** The neutral judge: the line map-matched on Valhalla and scored on its road data. */
async function judge(route: any): Promise<RouteAnalysis | null> {
  const km = route.distance / 1000;
  const t = await valhallaStretches(route.geometry.coordinates, prefs, "map_snap", 20000).catch(() => null);
  return t && t.stretches.length ? analyseStretches(t.shape, t.stretches, km) : null;
}

type Row = { case: string; engine: EngineName; found: boolean; km: number; min: number; extra: number | null; j: RouteAnalysis | null };
const rows: Row[] = [];

// Optional filters: --only=Keswick,Asheville  --engine=valhalla
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const only = arg("only")?.split(",").map((s) => s.toLowerCase());
const engines = (arg("engine")?.split(",") ?? ["osrm", "valhalla", "both"]) as EngineName[];

for (const c of CASES.filter((c) => !only || only.some((o) => c.name.toLowerCase().includes(o)))) {
  for (const engine of engines) {
    process.stdout.write(`${c.name} · ${engine} … `);
    try {
      if (c.kind === "twisty") {
        const plan = await buildTwisty([c.from, c.to], prefs, { engine, roadData: true });
        const pick = plan.twisty?.route ?? plan.direct?.route;
        if (!pick) throw new Error("no route");
        rows.push({
          case: c.name,
          engine,
          found: !!plan.twisty,
          km: pick.distance / 1000,
          min: pick.duration / 60,
          extra: plan.direct ? pick.duration / plan.direct.route.duration - 1 : null,
          j: await judge(pick),
        });
      } else {
        const best = await buildLoop(c.at[1], c.at[0], c.km, c.vibe, prefs, { engine, roadData: true, random: mulberry32(c.seed) });
        if (!best) throw new Error("no loop");
        rows.push({ case: c.name, engine, found: true, km: best.route.distance / 1000, min: best.route.duration / 60, extra: null, j: await judge(best.route) });
      }
      console.log("done");
    } catch (e) {
      console.log("failed:", e instanceof Error ? e.message : e);
    }
  }
}

const pct = (v: number | undefined) => (v === undefined ? "  –" : `${Math.round(v * 100)}%`.padStart(4));
console.log("\nJudged on Valhalla road data (higher bends/km is better; lower shares are better)\n");
console.log("case".padEnd(40), "engine   ", "twisty", "   km", "  min", " +time", " bends/km", " mway", " town", " grav", " twice");
for (const r of rows) {
  console.log(
    r.case.padEnd(40),
    r.engine.padEnd(9),
    (r.found ? "yes" : "no ").padEnd(6),
    r.km.toFixed(0).padStart(5),
    r.min.toFixed(0).padStart(5),
    (r.extra === null ? "  –" : `+${Math.round(r.extra * 100)}%`).padStart(6),
    (r.j ? r.j.twist.toFixed(0) : "–").padStart(9),
    pct(r.j?.motorway),
    pct(r.j?.urban),
    pct(r.j?.unpaved),
    pct(r.j?.retrace),
  );
}
