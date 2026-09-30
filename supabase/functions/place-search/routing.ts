// Routing, and the twisty / loop planners that score candidate routes.
//
// Two engines sit behind one interface so they can be compared on the same
// requests (scripts/eval-routing.ts):
//  - OSRM (car profile): speeds per segment from its annotations; road type
//    is guessed from speed.
//  - Valhalla (motorcycle / auto / bicycle costing): the route, then its road
//    data from trace_attributes: road class, speed, built-up density, surface,
//    roundabouts and slip roads per stretch.
//
// The scoring is what makes the plans good:
//  - Bends, not junctions: the line is resampled every 25 m and turning is
//    counted per step with a cap, so a 90° town junction or a roundabout adds
//    little, while a run of sweepers adds a lot.
//  - Rural roads only: each stretch is weighted by what kind of road it is,
//    so town streets and motorways count for (almost) nothing.
//  - No spurs: riding back down the road you came in on, and U-turns at a via
//    point, are penalised hard.
//  - Loops land on the length asked for: a second round re-scales the ring
//    from the first round's results.
//  - Scenic loops go through real viewpoints, peaks and waterfalls nearby.

import { fetchWithTimeout, hasOwnGeoServer, upstreamHeaders, viaGeo } from "../_shared/upstream.ts";

export type LngLat = [number, number];
/**
 * "both" (with our own geo server): routes come from Valhalla, and twisty /
 * loop planning tries every candidate on both engines, scores them all on
 * Valhalla's road data and keeps the best. Each engine finds good roads the
 * other misses (scripts/eval-routing.ts).
 */
export type EngineName = "osrm" | "valhalla" | "both";
type OneEngine = "osrm" | "valhalla";
const enginesOf = (e: EngineName): OneEngine[] => (e === "both" ? ["valhalla", "osrm"] : [e]);

// The rider's route preferences (Settings → Navigation) and what they ride.
export type RoutePrefs = {
  avoid?: { motorways?: boolean; tolls?: boolean; ferries?: boolean; unpaved?: boolean };
  vehicle?: "motorcycle" | "car" | "bicycle";
};

export type Prefs = {
  avoid: { motorways: boolean; tolls: boolean; ferries: boolean; unpaved: boolean };
  vehicle: "motorcycle" | "car" | "bicycle";
  steps?: boolean;
};

/** Only booleans and known vehicles get through. */
export function readPrefs(b: RoutePrefs | undefined): Prefs {
  const a = (b?.avoid ?? {}) as Record<string, unknown>;
  const v = b?.vehicle;
  return {
    avoid: { motorways: a.motorways === true, tolls: a.tolls === true, ferries: a.ferries === true, unpaved: a.unpaved === true },
    vehicle: v === "car" || v === "bicycle" ? v : "motorcycle",
  };
}

const PUBLIC_OSRM = ["https://router.project-osrm.org"];
const PUBLIC_VALHALLA = ["https://valhalla1.openstreetmap.de"];

// ---- Engines --------------------------------------------------------------------

export async function osrmRoute(stops: LngLat[], steps = false, timeoutMs = 9000): Promise<any | null> {
  const path = stops.map(([lo, la]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(";");
  return viaGeo("osrm", PUBLIC_OSRM, async (base, own) => {
    const url = new URL(`${base}/route/v1/driving/${path}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("alternatives", "false");
    url.searchParams.set("steps", steps ? "true" : "false");
    url.searchParams.set("annotations", "speed");
    const res = await fetchWithTimeout(url.toString(), { headers: upstreamHeaders(own, { Accept: "application/json" }) }, timeoutMs);
    // OSRM answers 400 NoRoute / NoSegment for points it can't route: an answer, not an outage.
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    return json?.code === "Ok" ? json?.routes?.[0] ?? null : null;
  });
}

function valhallaCosting(p: Prefs): { costing: string; options: Record<string, unknown> } {
  const costing = p.vehicle === "bicycle" ? "bicycle" : p.vehicle === "car" ? "auto" : "motorcycle";
  const opts: Record<string, unknown> = {};
  if (costing === "bicycle") {
    if (p.avoid.ferries) opts.use_ferry = 0;
    if (p.avoid.unpaved) opts.avoid_bad_surfaces = 1;
  } else {
    // Soft avoidance, like Waze: kept off them unless there's no other way.
    if (p.avoid.motorways) opts.use_highways = 0;
    if (p.avoid.tolls) opts.use_tolls = 0;
    if (p.avoid.ferries) opts.use_ferry = 0;
    if (p.avoid.unpaved) opts.exclude_unpaved = true;
  }
  return { costing, options: { [costing]: opts } };
}

/** Valhalla in OSRM's response format (so turn-by-turn steps parse the same), honouring avoid-preferences and bike routing. */
export async function valhallaRoute(stops: LngLat[], p: Prefs, timeoutMs = 9000): Promise<any | null> {
  const { costing, options } = valhallaCosting(p);
  const body = JSON.stringify({
    locations: stops.map(([lo, la]) => ({ lat: la, lon: lo })),
    costing,
    costing_options: options,
    format: "osrm",
    shape_format: "geojson",
    units: "kilometers",
  });
  return viaGeo("valhalla", PUBLIC_VALHALLA, async (base, own) => {
    const res = await fetchWithTimeout(`${base}/route`, {
      method: "POST",
      headers: upstreamHeaders(own, { "Content-Type": "application/json", Accept: "application/json" }),
      body,
    }, timeoutMs);
    // Valhalla answers 400 when there's no route between the points: an answer, not an outage.
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Valhalla ${res.status}`);
    const json = await res.json();
    return json?.code === "Ok" ? json?.routes?.[0] ?? null : null;
  });
}

/** What the scoring needs to know about one stretch of road. */
export interface Stretch {
  /** Shape point indices the stretch covers (from, to). */
  from: number;
  to: number;
  cls: string;
  kmh: number;
  density: number;
  roundabout: boolean;
  /** Slip roads and turn channels. */
  ramp: boolean;
  unpaved: boolean;
}

const UNPAVED = new Set(["compacted", "dirt", "gravel", "path", "impassable"]);

/** Decodes Valhalla's polyline6 into [lng, lat] points. */
export function decodePolyline6(s: string): LngLat[] {
  const out: LngLat[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < s.length + 1);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lng += next();
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

/**
 * The road data along a line from Valhalla's trace_attributes. `walk_or_snap`
 * walks the edges of a line Valhalla itself routed (fast), matching it to the
 * map where the rounded coordinates don't line up exactly; `map_snap` matches
 * any line (the evaluation uses it to judge OSRM's routes too).
 */
export async function valhallaStretches(
  line: LngLat[],
  p: Prefs,
  match: "walk_or_snap" | "map_snap" = "walk_or_snap",
  timeoutMs = 9000,
): Promise<{ shape: LngLat[]; stretches: Stretch[] } | null> {
  const { costing, options } = valhallaCosting(p);
  const body = JSON.stringify({
    shape: line.map(([lon, lat]) => ({ lat, lon })),
    costing,
    costing_options: options,
    shape_match: match,
    filters: {
      attributes: [
        "shape",
        "edge.road_class",
        "edge.speed",
        "edge.density",
        "edge.roundabout",
        "edge.use",
        "edge.surface",
        "edge.begin_shape_index",
        "edge.end_shape_index",
      ],
      action: "include",
    },
  });
  return viaGeo("valhalla", PUBLIC_VALHALLA, async (base, own) => {
    const res = await fetchWithTimeout(`${base}/trace_attributes`, {
      method: "POST",
      headers: upstreamHeaders(own, { "Content-Type": "application/json", Accept: "application/json" }),
      body,
    }, timeoutMs);
    // 400: the line couldn't be matched (or is over the server's trace limits).
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Valhalla trace ${res.status}`);
    const json = await res.json();
    if (typeof json?.shape !== "string" || !Array.isArray(json?.edges)) return null;
    const stretches: Stretch[] = json.edges
      .filter((e: any) => Number.isFinite(e?.begin_shape_index) && Number.isFinite(e?.end_shape_index))
      .map((e: any) => ({
        from: e.begin_shape_index,
        to: e.end_shape_index,
        cls: String(e.road_class ?? ""),
        kmh: Number(e.speed) || 0,
        density: Number(e.density) || 0,
        roundabout: e.roundabout === true,
        ramp: e.use === "ramp" || e.use === "turn_channel",
        unpaved: UNPAVED.has(String(e.surface ?? "")),
      }));
    return { shape: decodePolyline6(json.shape), stretches };
  });
}

/** Routes with the rider's preferences on the chosen engine. OSRM can't avoid anything or route bikes, so those go to Valhalla either way. */
export async function routeFor(stops: LngLat[], p: Prefs, which: EngineName): Promise<any | null> {
  const engine: OneEngine = which === "both" ? "valhalla" : which;
  const needsValhalla = p.vehicle === "bicycle" || p.avoid.motorways || p.avoid.tolls || p.avoid.ferries || p.avoid.unpaved;
  if (engine === "valhalla" || needsValhalla) {
    try {
      const r = await valhallaRoute(stops, p);
      if (r?.geometry) return r;
      if (engine === "valhalla") return null;
    } catch (e) {
      console.warn("[routing] Valhalla failed, using OSRM:", e instanceof Error ? e.message : e);
    }
  }
  return osrmRoute(stops, p.steps === true);
}

// ---- Scoring ----------------------------------------------------------------------

export interface RouteAnalysis {
  /** Degrees of bend per km on rural roads (junction turns capped). */
  twist: number;
  /** Share of distance on fast dual carriageway / motorway. */
  motorway: number;
  /** Share of distance on town streets. */
  urban: number;
  /** Share of distance on gravel, dirt and other unsealed roads (known with Valhalla only). */
  unpaved: number;
  /** Share of the line that rides back over road already ridden. */
  retrace: number;
  /** Near-reversals (U-turns at via points and the like). */
  uturns: number;
  km: number;
}

/** How much one stretch of road counts, and what kind of road it is. */
interface RoadKind {
  rural: number;
  motorway: boolean;
  urban: boolean;
  unpaved: boolean;
}

const toMeters = (a: LngLat, b: LngLat) => {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return [(b[0] - a[0]) * 111320 * Math.cos(lat), (b[1] - a[1]) * 110540] as const;
};

const NO_ANALYSIS = (km: number): RouteAnalysis => ({ twist: 0, motorway: 0, urban: 0, unpaved: 0, retrace: 0, uturns: 0, km });

/** The geometry part of the scoring: bends, shares by road kind, retrace, U-turns. `kindAt(i)` describes segment i (point i to i+1). */
function analyseLine(coords: LngLat[], km: number, kindAt: (seg: number) => RoadKind): RouteAnalysis {
  if (coords.length < 3 || km <= 0) return NO_ANALYSIS(km);

  // Resample every 25 m, carrying the road kind of the segment each sample sits on.
  const STEP = 25;
  const pts: { x: number; y: number; k: RoadKind }[] = [];
  let x = 0;
  let y = 0;
  let carry = 0;
  pts.push({ x, y, k: kindAt(0) });
  for (let i = 1; i < coords.length; i++) {
    const [dx, dy] = toMeters(coords[i - 1], coords[i]);
    const seg = Math.hypot(dx, dy);
    if (seg === 0) continue;
    const k = kindAt(i - 1);
    let along = STEP - carry;
    while (along <= seg) {
      pts.push({ x: x + (dx * along) / seg, y: y + (dy * along) / seg, k });
      along += STEP;
    }
    carry = seg - (along - STEP);
    x += dx;
    y += dy;
  }
  if (pts.length < 4) return NO_ANALYSIS(km);

  const heading: number[] = [];
  for (let i = 1; i < pts.length; i++) heading.push(Math.atan2(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * 180 / Math.PI);
  const turn = (a: number, b: number) => {
    const d = Math.abs(b - a) % 360;
    return d > 180 ? 360 - d : d;
  };

  let bend = 0;
  let motorwayN = 0;
  let urbanN = 0;
  let unpavedN = 0;
  let uturns = 0;
  for (let i = 1; i < heading.length; i++) {
    const k = pts[i].k;
    bend += Math.min(turn(heading[i - 1], heading[i]), 32) * k.rural;
    if (k.motorway) motorwayN++;
    if (k.urban) urbanN++;
    if (k.unpaved) unpavedN++;
    // A reversal within ~75 m.
    if (i >= 3 && turn(heading[i - 3], heading[i]) > 150) uturns++;
  }

  // Retrace: a sample landing in a 40 m cell already visited ≥ 500 m earlier.
  const seen = new Map<string, number>();
  let retraced = 0;
  pts.forEach((p, i) => {
    const key = `${Math.round(p.x / 40)}:${Math.round(p.y / 40)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else if (i - first > 20) retraced++;
  });

  // Shares over all samples (as before the Valhalla scoring, so OSRM scores are unchanged).
  const n = pts.length;
  return {
    twist: bend / Math.max(0.5, km),
    motorway: motorwayN / n,
    urban: urbanN / n,
    unpaved: unpavedN / n,
    retrace: retraced / pts.length,
    uturns: Math.floor(uturns / 3),
    km,
  };
}

const OPEN_ROAD: RoadKind = { rural: 1, motorway: false, urban: false, unpaved: false };

/** OSRM: road kind guessed from its car speeds (residential / unclassified ~25, tertiary ~40, secondary ~55, primary ~65, trunk ~85, motorway ~90 km/h). */
export function analyseOsrm(route: any): RouteAnalysis {
  const coords: LngLat[] = route?.geometry?.coordinates ?? [];
  const km = (route?.distance ?? 0) / 1000;
  const speeds: number[] = (route?.legs ?? []).flatMap((l: any) => (l?.annotation?.speed ?? []) as number[]);
  if (speeds.length !== coords.length - 1) return analyseLine(coords, km, () => OPEN_ROAD);
  return analyseLine(coords, km, (i) => {
    const kmh = Number.isFinite(speeds[i]) ? speeds[i] * 3.6 : 60;
    // Bends count fully from secondary roads, well on tertiary B-roads, little
    // on estates and lanes, and hardly at all on dual carriageways.
    const rural = Math.max(0, Math.min(1, (kmh - 22) / 30)) * (kmh >= 82 ? 0.15 : 1);
    return { rural, motorway: kmh >= 82, urban: kmh < 30, unpaved: false };
  });
}

// How much bends count on each class of road. Lanes (unclassified) can be great
// but are often single-track farm roads, so they count a bit less.
const CLASS_WEIGHT: Record<string, number> = {
  motorway: 0.05,
  trunk: 0.35,
  primary: 1,
  secondary: 1,
  tertiary: 0.9,
  unclassified: 0.7,
  residential: 0.1,
  service_other: 0,
};
/** Valhalla's road density (0–15) from which a stretch is taken as in town. */
export const TOWN_DENSITY = 9;

export function roadKind(s: Stretch): RoadKind {
  const town = s.density >= TOWN_DENSITY;
  const motorway = s.cls === "motorway" || (s.cls === "trunk" && s.kmh >= 90);
  const urban = !motorway && (s.cls === "residential" || s.cls === "service_other" || town);
  const rural = s.roundabout || s.ramp ? 0 : (CLASS_WEIGHT[s.cls] ?? 0.5) * (town ? 0.35 : 1);
  return { rural, motorway, urban, unpaved: s.unpaved };
}

/** Scores a line from its Valhalla road data (the stretches index into `shape`). */
export function analyseStretches(shape: LngLat[], stretches: Stretch[], km: number): RouteAnalysis {
  const bySeg: RoadKind[] = new Array(Math.max(0, shape.length - 1)).fill(OPEN_ROAD);
  for (const s of stretches) {
    const k = roadKind(s);
    for (let i = Math.max(0, s.from); i < Math.min(bySeg.length, s.to); i++) bySeg[i] = k;
  }
  return analyseLine(shape, km, (i) => bySeg[i] ?? OPEN_ROAD);
}

/**
 * Scores a route. OSRM routes carry their speeds. Valhalla routes (including
 * every avoid-preference and bike route, whichever engine was asked) fetch
 * their road data with one quick call, but only from our own server: on the
 * public one that would double the load, so there they score as open road,
 * as they always have.
 */
export async function analyseRoute(route: any, p: Prefs, engine: EngineName, roadData = hasOwnGeoServer): Promise<RouteAnalysis> {
  const km = (route?.distance ?? 0) / 1000;
  const coords: LngLat[] = route?.geometry?.coordinates ?? [];
  // With both engines in play, every route is scored on the same road data so the scores compare.
  if (engine !== "both" && route?.legs?.[0]?.annotation?.speed) return analyseOsrm(route);
  if (!roadData && engine !== "both") return analyseLine(coords, km, () => OPEN_ROAD);
  try {
    const t = await valhallaStretches(coords, p);
    if (t && t.stretches.length) return analyseStretches(t.shape, t.stretches, km);
  } catch (e) {
    console.warn("[routing] road data unavailable:", e instanceof Error ? e.message : e);
  }
  return analyseLine(coords, km, () => OPEN_ROAD);
}

export type Vibe = "curvy" | "scenic" | "relaxed";

/** Higher is better. `distErr` is the relative miss on a requested length (0 for A→B). */
export function scoreRoute(a: RouteAnalysis, vibe: Vibe, distErr: number, scenicHits = 0): number {
  const spur = a.retrace * 160 + a.uturns * 10;
  const len = distErr * 90;
  const gravel = a.unpaved * 60;
  if (vibe === "curvy") return a.twist - a.motorway * 80 - a.urban * 50 - gravel - spur - len;
  if (vibe === "scenic") {
    // Backroads through the good stuff; a steady ride rather than a knee-down one.
    const flow = -Math.abs(a.twist - 55) * 0.5;
    return 40 + flow + scenicHits * 18 - a.motorway * 90 - a.urban * 60 - gravel - spur - len;
  }
  // Relaxed: flowing, gently bending, quiet roads; no motorway, few towns, no fuss.
  return 40 - Math.abs(a.twist - 28) * 0.8 - a.motorway * 100 - a.urban * 70 - gravel - spur - len;
}

// ---- Planners -----------------------------------------------------------------------

function destPoint(lat: number, lng: number, bearingDeg: number, distKm: number): LngLat {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const dr = distKm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return [((lng2 * 180) / Math.PI + 540) % 360 - 180, (lat2 * 180) / Math.PI];
}

function kmBetween(a: LngLat, b: LngLat) {
  const [dx, dy] = toMeters(a, b);
  return Math.hypot(dx, dy) / 1000;
}

export type ScenicSpot = { at: LngLat; name: string };

export interface PlanOptions {
  engine: EngineName;
  /** Viewpoints, peaks and waterfalls round a point (scenic loops). */
  scenicSpots?: (lat: number, lng: number, radiusKm: number) => Promise<ScenicSpot[]>;
  /** Random numbers for the loop shapes (seeded in the evaluation so both engines try the same loops). */
  random?: () => number;
  /** Fetch Valhalla road data for scoring (default: only with our own server). */
  roadData?: boolean;
}

export async function buildLoop(lat: number, lng: number, distanceKm: number, vibe: Vibe, prefs: Prefs, o: PlanOptions) {
  const rnd = o.random ?? Math.random;
  const home: LngLat = [lng, lat];
  // A road loop runs ~1.3x the ring through its via points.
  let radiusKm = distanceKm / 1.3 / (2 * Math.PI) * 1.55;
  const spots = vibe === "scenic" && o.scenicSpots ? await o.scenicSpots(lat, lng, radiusKm * 1.6) : [];

  type Cand = { score: number; a: RouteAnalysis; route: any; stops: { lat: number; lng: number; name?: string }[]; distErr: number };
  const all: Cand[] = [];

  const shape = (b0: number, n: number, scale: number) => {
    const vias: { at: LngLat; name?: string }[] = [];
    for (let k = 0; k < n; k++) {
      const bearing = (b0 + (k * 360) / n + (rnd() - 0.5) * 24) % 360;
      let at = destPoint(lat, lng, bearing, radiusKm * scale * (0.85 + rnd() * 0.3));
      let name: string | undefined;
      if (spots.length) {
        // Swap the ring point for the nearest scenic spot close to it.
        let best: ScenicSpot | null = null;
        let bestD = radiusKm * 0.45;
        for (const s of spots) {
          const d = kmBetween(at, s.at);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        if (best) {
          at = best.at;
          name = best.name || undefined;
        }
      }
      vias.push({ at, name });
    }
    return vias;
  };

  const tryCandidates = async (shapes: { at: LngLat; name?: string }[][]) => {
    const jobs = shapes.flatMap((vias, i) => enginesOf(o.engine).map((engine) => ({ vias, i, engine })));
    const results = await Promise.allSettled(
      jobs.map(async ({ vias, engine }) => {
        const route = await routeFor([home, ...vias.map((v) => v.at), home], prefs, engine);
        if (!route?.geometry?.coordinates?.length) return null;
        return { route, a: await analyseRoute(route, prefs, o.engine, o.roadData) };
      }),
    );
    results.forEach((r, j) => {
      const i = jobs[j].i;
      if (r.status !== "fulfilled" || !r.value) return;
      const { route, a } = r.value;
      const distErr = Math.abs(a.km - distanceKm) / distanceKm;
      const hits = shapes[i].filter((v) => v.name !== undefined || spots.some((s) => s.at === v.at)).length;
      all.push({
        score: scoreRoute(a, vibe, distErr, hits),
        a,
        route,
        stops: shapes[i].map((v) => ({ lat: v.at[1], lng: v.at[0], ...(v.name ? { name: v.name } : {}) })),
        distErr,
      });
    });
  };

  // Round one: triangles and quads at random rotations.
  const r0 = rnd() * 360;
  await tryCandidates([shape(r0, 3, 1), shape(r0 + 60, 3, 1), shape(r0 + 30, 4, 0.9), shape(r0 + 75, 4, 0.9)]);
  // Round two: re-scale the ring from how long round one came out, and try again.
  const best1 = [...all].sort((x, y) => y.score - x.score)[0];
  if (all.length && (!best1 || best1.distErr > 0.12)) {
    const ratios = all.map((c) => c.a.km / distanceKm).sort((x, y) => x - y);
    const median = ratios[Math.floor(ratios.length / 2)];
    if (median > 0.2) radiusKm /= median;
    const r1 = rnd() * 360;
    await tryCandidates([shape(r1, 3, 1), shape(r1 + 45, 4, 0.9), shape(r1 + 90, 3, 1)]);
  } else if (!all.length) {
    await tryCandidates([shape(r0 + 180, 3, 0.8), shape(r0 + 240, 4, 0.75)]);
  }
  all.sort((x, y) => y.score - x.score);
  return all[0] ?? null;
}

export async function buildTwisty(coords: LngLat[], prefs: Prefs, o: PlanOptions) {
  const engines = enginesOf(o.engine);
  // Each engine's own direct ride: its detours are timed against it. The first
  // engine's is the "direct" option the rider is offered.
  const directs = await Promise.all(engines.map((e) => routeFor(coords, prefs, e).catch(() => null)));
  const direct = directs.find((r) => r?.geometry);
  if (!direct) return { direct: null, twisty: null };
  const d = await analyseRoute(direct, prefs, o.engine, o.roadData);

  const [sx, sy] = coords[0];
  const [ex, ey] = coords[coords.length - 1];
  const my = (sy + ey) / 2;
  const cosLat = Math.cos((my * Math.PI) / 180) || 1;
  const dx = (ex - sx) * cosLat;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy) || 1e-6;
  const perp: [number, number] = [-dy / len, dx / len];
  const spanKm = len * 111;
  const at = (f: number, offKm: number): LngLat => {
    const bx = sx + (ex - sx) * f;
    const by = sy + (ey - sy) * f;
    return [bx + (perp[0] * offKm) / (111 * cosLat), by + (perp[1] * offKm) / 111];
  };
  const off = (f: number) => Math.min(30, Math.max(3, spanKm * f));

  // Single bends either side at three depths, plus S-curves through two points.
  const shapes: LngLat[][] = [];
  for (const f of [0.16, 0.28, 0.42]) for (const s of [1, -1]) shapes.push([at(0.5, s * off(f))]);
  for (const s of [1, -1]) shapes.push([at(0.33, s * off(0.24)), at(0.67, -s * off(0.24))]);

  // Worth it only up to ~60% longer than the direct ride. Valhalla's times on
  // small roads are cautious next to its main-road times (and OSRM's), and a
  // rider asking for the twisty way has already chosen a slower ride, so on
  // Valhalla a detour is judged on distance, with a loose cap on time.
  const tooLong = (route: any, engine: OneEngine) => {
    const own = directs[engines.indexOf(engine)]?.geometry ? directs[engines.indexOf(engine)] : direct;
    return engine === "valhalla"
      ? route.distance > own.distance * 1.6 || route.duration > own.duration * 2.5
      : route.duration > own.duration * 1.6;
  };

  const cands: { vias: LngLat[]; route: any; a: RouteAnalysis; score: number; engine: OneEngine }[] = [];
  for (let i = 0; i < shapes.length; i += 4) {
    const jobs = shapes.slice(i, i + 4).flatMap((vias) => engines.map((engine) => ({ vias, engine })));
    const res = await Promise.allSettled(
      jobs.map(async ({ vias, engine }) => {
        const route = await routeFor([coords[0], ...vias, ...coords.slice(1)], prefs, engine);
        if (!route?.geometry || tooLong(route, engine)) return null;
        return { route, a: await analyseRoute(route, prefs, o.engine, o.roadData) };
      }),
    );
    res.forEach((r, k) => {
      if (r.status !== "fulfilled" || !r.value) return;
      const { route, a } = r.value;
      cands.push({ vias: jobs[k].vias, route, a, score: scoreRoute(a, "curvy", 0), engine: jobs[k].engine });
    });
  }
  cands.sort((x, y) => y.score - x.score);
  const best = cands[0];
  const worth = best && best.a.twist >= d.twist * 1.25 && best.a.twist - d.twist >= 8 && best.a.retrace < 0.08;
  return { direct: { route: direct, a: d }, twisty: worth ? best : null };
}
