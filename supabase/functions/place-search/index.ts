import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://blacktoplive.com",
  "https://convoy-comms.lovable.app",
  "https://8006f12b-bc88-412a-bd3c-677561cc727f.lovableproject.com",
  "https://id-preview--8006f12b-bc88-412a-bd3c-677561cc727f.lovable.app",
  // The native apps serve their bundled web app from these origins (Android / iOS).
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
  // Local dev servers (callers still need a valid session + rate limit).
  "http://localhost:8080",
  "http://localhost:5173",
]);

function getCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://convoy-comms.lovable.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

type SearchBody = {
  kind: "search";
  q: string;
  countryCode?: string | null;
  viewbox?: string | null;
  bounded?: "0" | "1" | 0 | 1 | boolean | null;
  limit?: number | string | null;
};

type ReverseBody = {
  kind: "reverse";
  lat: number;
  lon: number;
  zoom?: number;
};

type OverpassBody = {
  kind: "overpass";
  lat: number;
  lon: number;
  radius_m?: number;
  amenities: string[];
  filter24h?: boolean;
  /** Free-text name/brand search near the point. */
  name?: string;
  limit?: number;
};

/** Track Pack builder: every drivable road inside a box, cut at the box edge. */
type RoadsBody = {
  kind: "roads";
  west: number;
  south: number;
  east: number;
  north: number;
};

// The rider's route preferences (Settings → Navigation) and what they ride.
type RoutePrefs = {
  avoid?: { motorways?: boolean; tolls?: boolean; ferries?: boolean; unpaved?: boolean };
  vehicle?: "motorcycle" | "car" | "bicycle";
};

type RouteBody = RoutePrefs & {
  kind: "route";
  // [lng, lat] pairs, in order from start to destination.
  coordinates: [number, number][];
  // Include the turn-by-turn manoeuvres for each leg.
  steps?: boolean;
};

type LoopBody = RoutePrefs & {
  kind: "loop";
  lat: number;
  lng: number;
  // Target loop length in kilometres.
  distanceKm: number;
  vibe?: "curvy" | "scenic" | "relaxed";
};

type TwistyBody = RoutePrefs & {
  kind: "twisty";
  // [lng, lat] pairs, start → destination (intermediate stops allowed).
  coordinates: [number, number][];
};

type CamerasBody = {
  kind: "cameras";
  west: number;
  south: number;
  east: number;
  north: number;
  zoom?: number;
};

function isLngLat(c: unknown): c is [number, number] {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    typeof c[0] === "number" &&
    typeof c[1] === "number" &&
    c[0] >= -180 && c[0] <= 180 &&
    c[1] >= -90 && c[1] <= 90
  );
}

function asBounded(v: SearchBody["bounded"]): "0" | "1" | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === true) return "1";
  if (v === false) return "0";
  if (v === 1 || v === "1") return "1";
  if (v === 0 || v === "0") return "0";
  return undefined;
}

function escapeRegexPart(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

type PhotonHit = { id: string; lat: number; lon: number; tags: Record<string, string> };

/** Photon (komoot) OSM search: fast, tolerant of cloud servers, supports a bbox and tag filters. */
async function photonSearch(opts: {
  q: string;
  center?: { lat: number; lon: number } | null;
  bbox?: [number, number, number, number] | null;
  osmTags?: string[];
  limit?: number;
}): Promise<PhotonHit[]> {
  if (!opts.q) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", opts.q.slice(0, 100));
  url.searchParams.set("limit", String(opts.limit ?? 20));
  if (opts.center) {
    url.searchParams.set("lat", String(opts.center.lat));
    url.searchParams.set("lon", String(opts.center.lon));
  }
  if (opts.bbox) url.searchParams.set("bbox", opts.bbox.join(","));
  for (const t of opts.osmTags ?? []) url.searchParams.append("osm_tag", t);
  const res = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)", "Accept": "*/*" },
  }, 7000);
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.features) ? data.features : [])
    .filter((f: any) => Array.isArray(f?.geometry?.coordinates))
    .map((f: any) => {
      const p = f.properties ?? {};
      return {
        id: `ph${p.osm_type ?? ""}${p.osm_id ?? Math.random()}`,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        tags: {
          ...(p.name ? { name: p.name } : {}),
          ...(p.street ? { "addr:street": [p.housenumber, p.street].filter(Boolean).join(" ") } : {}),
          ...(p.city || p.district ? { "addr:city": p.city ?? p.district } : {}),
          ...(p.postcode ? { "addr:postcode": p.postcode } : {}),
          ...(p.country ? { country: p.country } : {}),
          ...(p.osm_key ? { [p.osm_key]: p.osm_value } : {}),
        },
      };
    });
}

function boxAround(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 110540;
  const dLon = radiusM / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

async function fetchOverpass(query: string, timeoutMs = 9000) {
  // overpass-api.de answers 406 to "Accept: application/json" and wants a
  // contactable User-Agent; kumi.systems was timing out, so it goes last.
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "*/*",
          "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)",
        },
        body: `data=${encodeURIComponent(query)}`,
      }, timeoutMs);

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
      }

      return JSON.parse(text);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error("Overpass failed");
}

// ---- Twisty routes and loops ---------------------------------------------------
//
// Both run on the public OSRM car profile, so what we score is exactly what the
// app will route through the returned via points. The scoring is what makes
// them good:
//  - Bends, not junctions: the line is resampled every 25 m and turning is
//    counted per step with a cap, so a 90° town junction or a roundabout adds
//    little, while a run of sweepers adds a lot.
//  - Rural roads only: each stretch is weighted by OSRM's speed for it, so
//    30 mph streets and motorways count for (almost) nothing.
//  - No spurs: riding back down the road you came in on, and U-turns at a via
//    point, are penalised hard.
//  - Loops land on the length asked for: a second round re-scales the ring
//    from the first round's results.
//  - Scenic loops go through real viewpoints, peaks and waterfalls nearby.

type LngLat = [number, number];

type Prefs = { avoid: { motorways: boolean; tolls: boolean; ferries: boolean; unpaved: boolean }; vehicle: "motorcycle" | "car" | "bicycle"; steps?: boolean };

/** Only booleans and known vehicles get through. */
function readPrefs(b: RoutePrefs | undefined): Prefs {
  const a = (b?.avoid ?? {}) as Record<string, unknown>;
  const v = b?.vehicle;
  return {
    avoid: { motorways: a.motorways === true, tolls: a.tolls === true, ferries: a.ferries === true, unpaved: a.unpaved === true },
    vehicle: v === "car" || v === "bicycle" ? v : "motorcycle",
  };
}

async function osrmRoute(stops: LngLat[], steps = false, timeoutMs = 9000): Promise<any | null> {
  const path = stops.map(([lo, la]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${path}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", steps ? "true" : "false");
  url.searchParams.set("annotations", "speed");
  const res = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)", "Accept": "application/json" },
  }, timeoutMs);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  return json?.code === "Ok" ? json?.routes?.[0] ?? null : null;
}

/** Valhalla (FOSSGIS public server) in OSRM's response format, honouring avoid-preferences and bike routing. */
async function valhallaRoute(stops: LngLat[], p: Prefs, timeoutMs = 9000): Promise<any | null> {
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
  const res = await fetchWithTimeout("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)", "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      locations: stops.map(([lo, la]) => ({ lat: la, lon: lo })),
      costing,
      costing_options: { [costing]: opts },
      format: "osrm",
      shape_format: "geojson",
      units: "kilometers",
    }),
  }, timeoutMs);
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const json = await res.json();
  return json?.code === "Ok" ? json?.routes?.[0] ?? null : null;
}

/** Routes with the rider's preferences: Valhalla when they need it, OSRM otherwise (and as the fallback). */
async function routeFor(stops: LngLat[], p: Prefs): Promise<any | null> {
  const needsValhalla = p.vehicle === "bicycle" || p.avoid.motorways || p.avoid.tolls || p.avoid.ferries || p.avoid.unpaved;
  if (needsValhalla) {
    try {
      const r = await valhallaRoute(stops, p);
      if (r?.geometry) return r;
    } catch (e) {
      console.warn("[PLACE-SEARCH] Valhalla failed, using OSRM:", e instanceof Error ? e.message : e);
    }
  }
  return osrmRoute(stops, p.steps === true);
}

interface RouteAnalysis {
  /** Degrees of bend per km on rural roads (junction turns capped). */
  twist: number;
  /** Share of distance on fast dual carriageway / motorway. */
  motorway: number;
  /** Share of distance on slow town streets. */
  urban: number;
  /** Share of the line that rides back over road already ridden. */
  retrace: number;
  /** Near-reversals (U-turns at via points and the like). */
  uturns: number;
  km: number;
}

const toMeters = (a: LngLat, b: LngLat) => {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return [(b[0] - a[0]) * 111320 * Math.cos(lat), (b[1] - a[1]) * 110540] as const;
};

function analyseRoute(route: any): RouteAnalysis {
  const coords: LngLat[] = route?.geometry?.coordinates ?? [];
  const km = (route?.distance ?? 0) / 1000;
  if (coords.length < 3 || km <= 0) return { twist: 0, motorway: 0, urban: 0, retrace: 0, uturns: 0, km };

  // Per-segment speed (km/h) from OSRM, aligned with the full geometry. Valhalla
  // doesn't send it: then every stretch is taken as an open road and the
  // motorway / town shares aren't counted.
  const segSpeeds: number[] = (route.legs ?? []).flatMap((l: any) => (l?.annotation?.speed ?? []) as number[]);
  const known = segSpeeds.length === coords.length - 1;
  const speedAt = (i: number) => {
    const v = known ? segSpeeds[i] * 3.6 : 60;
    return Number.isFinite(v) ? v : 60;
  };

  // Resample every 25 m, carrying the speed of the segment each sample sits on.
  const STEP = 25;
  const pts: { x: number; y: number; kmh: number }[] = [];
  let x = 0;
  let y = 0;
  let carry = 0;
  pts.push({ x, y, kmh: speedAt(0) });
  for (let i = 1; i < coords.length; i++) {
    const [dx, dy] = toMeters(coords[i - 1], coords[i]);
    const seg = Math.hypot(dx, dy);
    if (seg === 0) continue;
    let along = STEP - carry;
    while (along <= seg) {
      pts.push({ x: x + (dx * along) / seg, y: y + (dy * along) / seg, kmh: speedAt(i - 1) });
      along += STEP;
    }
    carry = seg - (along - STEP);
    x += dx;
    y += dy;
  }
  if (pts.length < 4) return { twist: 0, motorway: 0, urban: 0, retrace: 0, uturns: 0, km };

  const heading: number[] = [];
  for (let i = 1; i < pts.length; i++) heading.push(Math.atan2(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * 180 / Math.PI);
  const turn = (a: number, b: number) => {
    const d = Math.abs(b - a) % 360;
    return d > 180 ? 360 - d : d;
  };

  let bend = 0;
  let motorwayM = 0;
  let urbanM = 0;
  let uturns = 0;
  for (let i = 1; i < heading.length; i++) {
    const kmh = pts[i].kmh;
    // OSRM's car speeds: residential / unclassified ~25, tertiary ~40,
    // secondary ~55, primary ~65, trunk ~85, motorway ~90 km/h. Bends count
    // fully from secondary roads, well on tertiary B-roads, little on estates
    // and lanes, and hardly at all on dual carriageways.
    const rural = Math.max(0, Math.min(1, (kmh - 22) / 30)) * (kmh >= 82 ? 0.15 : 1);
    bend += Math.min(turn(heading[i - 1], heading[i]), 32) * rural;
    if (known && kmh >= 82) motorwayM += STEP;
    if (known && kmh < 30) urbanM += STEP;
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

  const totalM = pts.length * STEP;
  return {
    twist: bend / Math.max(0.5, km),
    motorway: motorwayM / totalM,
    urban: urbanM / totalM,
    retrace: retraced / pts.length,
    uturns: Math.floor(uturns / 3),
    km,
  };
}

type Vibe = "curvy" | "scenic" | "relaxed";

/** Higher is better. `distErr` is the relative miss on a requested length (0 for A→B). */
function scoreRoute(a: RouteAnalysis, vibe: Vibe, distErr: number, scenicHits = 0): number {
  const spur = a.retrace * 160 + a.uturns * 10;
  const len = distErr * 90;
  if (vibe === "curvy") return a.twist - a.motorway * 80 - a.urban * 50 - spur - len;
  if (vibe === "scenic") {
    // Backroads through the good stuff; a steady ride rather than a knee-down one.
    const flow = -Math.abs(a.twist - 55) * 0.5;
    return 40 + flow + scenicHits * 18 - a.motorway * 90 - a.urban * 60 - spur - len;
  }
  // Relaxed: flowing, gently bending, quiet roads; no motorway, few towns, no fuss.
  return 40 - Math.abs(a.twist - 28) * 0.8 - a.motorway * 100 - a.urban * 70 - spur - len;
}

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

/** Viewpoints, peaks and waterfalls round a point (scenic loops), best-effort. */
async function scenicSpots(lat: number, lng: number, radiusKm: number): Promise<{ at: LngLat; name: string }[]> {
  const r = Math.round(Math.min(60, radiusKm) * 1000);
  const q = `[out:json][timeout:8];(node(around:${r},${lat},${lng})[tourism=viewpoint];node(around:${r},${lat},${lng})[natural=peak][name];node(around:${r},${lat},${lng})[waterway=waterfall];node(around:${r},${lat},${lng})[mountain_pass=yes];);out 120;`;
  try {
    const json = await fetchOverpass(q, 8000);
    return (json?.elements ?? [])
      .filter((e: any) => typeof e.lat === "number" && typeof e.lon === "number")
      .map((e: any) => ({ at: [e.lon, e.lat] as LngLat, name: String(e.tags?.name ?? e.tags?.["name:en"] ?? "") }));
  } catch {
    return [];
  }
}

async function buildLoop(lat: number, lng: number, distanceKm: number, vibe: Vibe, prefs: Prefs) {
  const home: LngLat = [lng, lat];
  // A road loop runs ~1.3x the ring through its via points.
  let radiusKm = distanceKm / 1.3 / (2 * Math.PI) * 1.55;
  const spots = vibe === "scenic" ? await scenicSpots(lat, lng, radiusKm * 1.6) : [];

  type Cand = { score: number; a: RouteAnalysis; route: any; stops: { lat: number; lng: number; name?: string }[]; distErr: number };
  const all: Cand[] = [];

  const shape = (b0: number, n: number, scale: number) => {
    const vias: { at: LngLat; name?: string }[] = [];
    for (let k = 0; k < n; k++) {
      const bearing = (b0 + (k * 360) / n + (Math.random() - 0.5) * 24) % 360;
      let at = destPoint(lat, lng, bearing, radiusKm * scale * (0.85 + Math.random() * 0.3));
      let name: string | undefined;
      if (spots.length) {
        // Swap the ring point for the nearest scenic spot close to it.
        let best: { at: LngLat; name: string } | null = null;
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
    const results = await Promise.allSettled(shapes.map((vias) => routeFor([home, ...vias.map((v) => v.at), home], prefs)));
    results.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value?.geometry?.coordinates?.length) return;
      const a = analyseRoute(r.value);
      const distErr = Math.abs(a.km - distanceKm) / distanceKm;
      const hits = shapes[i].filter((v) => v.name !== undefined || spots.some((s) => s.at === v.at)).length;
      all.push({
        score: scoreRoute(a, vibe, distErr, hits),
        a,
        route: r.value,
        stops: shapes[i].map((v) => ({ lat: v.at[1], lng: v.at[0], ...(v.name ? { name: v.name } : {}) })),
        distErr,
      });
    });
  };

  // Round one: triangles and quads at random rotations.
  const r0 = Math.random() * 360;
  await tryCandidates([shape(r0, 3, 1), shape(r0 + 60, 3, 1), shape(r0 + 30, 4, 0.9), shape(r0 + 75, 4, 0.9)]);
  // Round two: re-scale the ring from how long round one came out, and try again.
  const best1 = [...all].sort((x, y) => y.score - x.score)[0];
  if (all.length && (!best1 || best1.distErr > 0.12)) {
    const ratios = all.map((c) => c.a.km / distanceKm).sort((x, y) => x - y);
    const median = ratios[Math.floor(ratios.length / 2)];
    if (median > 0.2) radiusKm /= median;
    const r1 = Math.random() * 360;
    await tryCandidates([shape(r1, 3, 1), shape(r1 + 45, 4, 0.9), shape(r1 + 90, 3, 1)]);
  } else if (!all.length) {
    await tryCandidates([shape(r0 + 180, 3, 0.8), shape(r0 + 240, 4, 0.75)]);
  }
  all.sort((x, y) => y.score - x.score);
  return all[0] ?? null;
}

async function buildTwisty(coords: LngLat[], prefs: Prefs) {
  const direct = await routeFor(coords, prefs);
  if (!direct?.geometry) return { direct: null, twisty: null };
  const d = analyseRoute(direct);

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

  const cands: { vias: LngLat[]; route: any; a: RouteAnalysis; score: number }[] = [];
  for (let i = 0; i < shapes.length; i += 4) {
    const batch = shapes.slice(i, i + 4);
    const res = await Promise.allSettled(batch.map((vias) => routeFor([coords[0], ...vias, ...coords.slice(1)], prefs)));
    res.forEach((r, k) => {
      if (r.status !== "fulfilled" || !r.value?.geometry) return;
      // Worth it only up to ~60% longer than the direct ride.
      if (r.value.duration > direct.duration * 1.6) return;
      const a = analyseRoute(r.value);
      cands.push({ vias: batch[k], route: r.value, a, score: scoreRoute(a, "curvy", 0) });
    });
  }
  cands.sort((x, y) => y.score - x.score);
  const best = cands[0];
  const worth = best && best.a.twist >= d.twist * 1.25 && best.a.twist - d.twist >= 8 && best.a.retrace < 0.08;
  return { direct: { route: direct, a: d }, twisty: worth ? best : null };
}

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  // Authenticate caller — prevents anonymous proxy abuse of Nominatim/Overpass.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 401,
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Rate limit: auth here is free (anonymous sign-in), so without this
    // every caller has an unthrottled proxy to Nominatim/Overpass. Limit
    // sized for the busiest legitimate pattern (150ms-debounced search-as-you-type
    // plus reverse-geocode/POI lookups), not a tight bound.
    const { data: allowed, error: rateLimitErr } = await supabase.rpc("check_rate_limit", {
      _bucket: "place-search",
      _max_requests: 60,
      _window_seconds: 60,
    });
    if (rateLimitErr || allowed === false) {
      return new Response(JSON.stringify({ error: "Too many requests, please slow down" }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 429,
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 401,
    });
  }


  try {
    const body = (await req.json()) as SearchBody | ReverseBody | OverpassBody | RouteBody | CamerasBody | LoopBody | TwistyBody | RoadsBody;

    if (body.kind === "twisty") {
      const coords = Array.isArray(body.coordinates) ? body.coordinates : [];
      if (coords.length < 2 || !coords.every(isLngLat)) {
        return new Response(JSON.stringify({ error: "Need at least two valid [lng,lat] coordinates" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      let plan: Awaited<ReturnType<typeof buildTwisty>>;
      try {
        plan = await buildTwisty(coords as LngLat[], readPrefs(body));
      } catch (e) {
        console.warn("[PLACE-SEARCH] Twisty planning failed:", e instanceof Error ? e.message : e);
        plan = { direct: null, twisty: null };
      }
      if (!plan.direct) {
        return new Response(JSON.stringify({ error: "Routing unavailable" }), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "routing_unavailable" },
          status: 200,
        });
      }
      const t = plan.twisty;
      return new Response(
        JSON.stringify({
          direct: {
            geometry: plan.direct.route.geometry,
            distance: plan.direct.route.distance,
            duration: plan.direct.route.duration,
            curviness: Math.round(plan.direct.a.twist),
          },
          twisty: t
            ? {
              geometry: t.route.geometry,
              distance: t.route.distance,
              duration: t.route.duration,
              curviness: Math.round(t.a.twist),
              // `via` for older apps; `vias` is the whole shape (one bend or an S).
              via: { lat: t.vias[0][1], lng: t.vias[0][0] },
              vias: t.vias.map(([lo, la]) => ({ lat: la, lng: lo })),
              motorwayPct: Math.round(t.a.motorway * 100),
            }
            : null,
        }),
        { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (body.kind === "loop") {
      const { lat, lng } = body;
      const distanceKm = Number(body.distanceKm);
      const vibe: Vibe = body.vibe === "relaxed" || body.vibe === "scenic" ? body.vibe : "curvy";
      const valid =
        typeof lat === "number" && typeof lng === "number" &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
        Number.isFinite(distanceKm) && distanceKm >= 10 && distanceKm <= 400;
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid loop request" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      let best: Awaited<ReturnType<typeof buildLoop>> = null;
      try {
        best = await buildLoop(lat, lng, distanceKm, vibe, readPrefs(body));
      } catch (e) {
        console.warn("[PLACE-SEARCH] Loop planning failed:", e instanceof Error ? e.message : e);
      }
      if (!best) {
        return new Response(JSON.stringify({ error: "Could not build a loop from here" }), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "routing_unavailable" },
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          geometry: best.route.geometry,
          distance: best.route.distance,
          duration: best.route.duration,
          stops: best.stops,
          curviness: Math.round(best.a.twist),
          motorwayPct: Math.round(best.a.motorway * 100),
          vibe,
        }),
        { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (body.kind === "roads") {
      const { west, south, east, north } = body;
      const valid =
        [west, south, east, north].every((n) => typeof n === "number" && Number.isFinite(n)) &&
        south >= -90 && north <= 90 && south < north &&
        west >= -180 && east <= 180 && west < east;
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid bounds" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      // ~40 km² is plenty for any circuit short of the Nordschleife, and keeps
      // Overpass (and the phone) from choking on a whole town's streets.
      const midLat = (south + north) / 2;
      const wM = (east - west) * 111320 * Math.cos((midLat * Math.PI) / 180);
      const hM = (north - south) * 110540;
      if (wM * hM > 40_000_000) {
        return new Response(JSON.stringify({ error: "area_too_big" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const query = `
        [out:json][timeout:20];
        way["highway"~"^(raceway|motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track|road|cycleway)$"]["service"!~"^(parking_aisle|driveway|drive-through)$"]["area"!="yes"](${south},${west},${north},${east});
        out geom;
      `;
      let data: any;
      try {
        data = await fetchOverpass(query, 22000);
      } catch (e) {
        console.warn("[PLACE-SEARCH] Overpass roads unavailable:", e instanceof Error ? e.message : e);
        return new Response(JSON.stringify({ error: "overpass_unavailable" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 503,
        });
      }

      // Cut every way into the runs of points inside the box (plus a small
      // margin), keeping node ids so the client can find junctions.
      const padLat = (north - south) * 0.03;
      const padLng = (east - west) * 0.03;
      const inside = (lat: number, lon: number) =>
        lat >= south - padLat && lat <= north + padLat && lon >= west - padLng && lon <= east + padLng;
      const pieces: { id: string; hw: string; name?: string; raceway?: string; pts: [number, number, number][] }[] = [];
      for (const el of Array.isArray(data?.elements) ? data.elements : []) {
        if (el?.type !== "way" || !Array.isArray(el.geometry) || !Array.isArray(el.nodes)) continue;
        if (el.geometry.length !== el.nodes.length) continue;
        let run: [number, number, number][] = [];
        let k = 0;
        const flush = () => {
          if (run.length >= 2) {
            pieces.push({
              id: `${el.id}:${k++}`,
              hw: String(el.tags?.highway ?? ""),
              name: el.tags?.name ? String(el.tags.name).slice(0, 60) : undefined,
              raceway: el.tags?.raceway ? String(el.tags.raceway).slice(0, 30) : undefined,
              pts: run,
            });
          }
          run = [];
        };
        for (let i = 0; i < el.geometry.length; i++) {
          const g = el.geometry[i];
          if (g && typeof g.lat === "number" && typeof g.lon === "number" && inside(g.lat, g.lon)) {
            run.push([Math.round(g.lat * 1e7) / 1e7, Math.round(g.lon * 1e7) / 1e7, Number(el.nodes[i])]);
          } else {
            flush();
          }
        }
        flush();
        if (pieces.length >= 5000) break;
      }

      return new Response(JSON.stringify({ pieces }), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
        status: 200,
      });
    }

    if (body.kind === "cameras") {
      const { west, south, east, north } = body;
      const zoom = typeof body.zoom === "number" ? body.zoom : 0;
      const valid =
        [west, south, east, north].every((n) => typeof n === "number" && Number.isFinite(n)) &&
        south >= -90 && north <= 90 && south < north &&
        west >= -180 && east <= 180 && west < east;

      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid bbox" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // Guard against continent-sized queries: below z13 (or a bbox bigger than
      // ~0.5 degrees a side) Overpass would return tens of thousands of nodes.
      if (zoom < 13 || north - south > 0.5 || east - west > 0.5) {
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const bbox = `${south},${west},${north},${east}`;
      const query = `
        [out:json][timeout:8];
        (
          node["highway"="speed_camera"](${bbox});
          node["man_made"="surveillance"]["surveillance:type"~"ALPR|alpr|anpr|ANPR",i](${bbox});
          node["man_made"="surveillance"]["surveillance:zone"="traffic"](${bbox});
        );
        out body 500;
      `;

      let data: any;
      try {
        data = await fetchOverpass(query);
      } catch (e) {
        console.warn("[PLACE-SEARCH] Camera lookup unavailable:", e instanceof Error ? e.message : e);
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "overpass_unavailable" },
          status: 200,
        });
      }

      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const cameras = elements
        .filter((el: any) => typeof el?.lat === "number" && typeof el?.lon === "number")
        .map((el: any) => {
          const tags = el.tags ?? {};
          const surveillanceType = String(tags["surveillance:type"] ?? "").toLowerCase();
          const isAlpr = surveillanceType.includes("alpr") || surveillanceType.includes("anpr");
          const type = tags.highway === "speed_camera" ? "speed" : isAlpr ? "alpr" : "surveillance";
          return {
            id: String(el.id),
            lat: el.lat,
            lng: el.lon,
            type,
            direction: tags.direction ?? null,
            maxspeed: tags.maxspeed ?? null,
          };
        })
        .slice(0, 500);

      return new Response(JSON.stringify(cameras), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
        status: 200,
      });
    }


    if (body.kind === "route") {
      const coords = Array.isArray(body.coordinates) ? body.coordinates : [];
      if (coords.length < 2 || !coords.every(isLngLat)) {
        return new Response(JSON.stringify({ error: "Need at least two valid [lng,lat] coordinates" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      let route: any = null;
      try {
        route = await routeFor(coords as LngLat[], { ...readPrefs(body), steps: body.steps === true });
      } catch (e) {
        console.warn("[PLACE-SEARCH] Routing unavailable:", e instanceof Error ? e.message : e);
        return new Response(JSON.stringify({ error: "Routing unavailable" }), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "routing_unavailable" },
          status: 200,
        });
      }
      if (!route?.geometry) {
        return new Response(JSON.stringify({ error: "No route found" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Manoeuvres only (no per-step geometry): the client places each one on
      // the full route line itself.
      const legs = body.steps === true && Array.isArray(route.legs)
        ? route.legs.map((leg: any) => ({
          distance: leg.distance,
          duration: leg.duration,
          steps: (Array.isArray(leg.steps) ? leg.steps : []).map((st: any) => ({
            type: st.maneuver?.type ?? "turn",
            modifier: st.maneuver?.modifier ?? null,
            exit: typeof st.maneuver?.exit === "number" ? st.maneuver.exit : null,
            location: st.maneuver?.location ?? null,
            name: typeof st.name === "string" ? st.name : "",
            ref: typeof st.ref === "string" ? st.ref : "",
            destinations: typeof st.destinations === "string" ? st.destinations : "",
            rotary: typeof st.rotary_name === "string" ? st.rotary_name : "",
            side: st.driving_side === "left" ? "left" : "right",
            distance: st.distance,
            duration: st.duration,
          })),
        }))
        : undefined;

      return new Response(
        JSON.stringify({
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
          ...(legs ? { legs } : {}),
        }),
        {
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
          status: 200,
        },
      );
    }

    if (body.kind === "overpass") {
      if (typeof body.lat !== "number" || typeof body.lon !== "number") {
        return new Response(JSON.stringify({ error: "Missing lat/lon" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      if (body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180) {
        return new Response(JSON.stringify({ error: "lat/lon out of range" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const amenities = Array.isArray(body.amenities) ? body.amenities.filter(Boolean).slice(0, 10) : [];
      const filter24h = body.filter24h === true;
      const nameQ = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";

      if (amenities.length === 0 && !filter24h && nameQ.length < 2) {
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const radius = Math.max(1000, Math.min(50000, body.radius_m ?? 30000));
      const limit = Math.max(1, Math.min(100, body.limit ?? 60));
      const around = `(around:${radius},${body.lat},${body.lon})`;

      let query: string;

      // nwr + "out center" so places mapped as buildings/areas (most
      // supermarkets, many fuel stations) are found, not just single points.
      if (filter24h) {
        query = `
          [out:json][timeout:10];
          (
            nwr["shop"]["opening_hours"~"24/7|24 hours|24h"]${around};
            nwr["amenity"~"^(fuel|convenience)$"]["opening_hours"~"24/7|24 hours|24h"]${around};
          );
          out center ${limit};
        `;
      } else if (nameQ.length >= 2) {
        const safe = escapeRegexPart(nameQ).replace(/"/g, "");
        query = `
          [out:json][timeout:10];
          (
            nwr["name"~"${safe}",i]${around};
            nwr["brand"~"${safe}",i]${around};
          );
          out center ${limit};
        `;
      } else {
        // Exact tag matches only: regex tag filters time out (504) on public Overpass.
        const SHOP_VALUES = new Set(["supermarket", "convenience", "bakery", "motorcycle", "car_repair", "tyres"]);
        const clauses = amenities
          .map((a) => a.replace(/[^a-z0-9_]/gi, ""))
          .filter(Boolean)
          .map((a) => `nwr["${SHOP_VALUES.has(a) ? "shop" : "amenity"}"="${a}"]${around};`)
          .join("\n            ");
        query = `
          [out:json][timeout:10];
          (
            ${clauses}
          );
          out center ${limit};
        `;
      }

      let data: any;
      try {
        // Short budget: Photon below is the quick fallback.
        // Name search goes straight to Photon (Overpass name regex is too slow).
        if (nameQ.length >= 2) throw new Error("name search via Photon");
        data = await fetchOverpass(query, 9000);
      } catch (e) {
        console.warn("[PLACE-SEARCH] Overpass unavailable, using Photon:", e instanceof Error ? e.message : e);
        const bbox = boxAround(body.lat, body.lon, radius);
        const center = { lat: body.lat, lon: body.lon };
        let hits: PhotonHit[] = [];
        try {
          if (nameQ.length >= 2) {
            hits = await photonSearch({ q: nameQ, center, bbox, limit });
          } else if (filter24h) {
            hits = await photonSearch({ q: "24 hour", center, bbox, osmTags: ["shop", "amenity:fuel"], limit });
          } else {
            // Photon matches names, not categories, so fuel also searches the big brands.
            const words: Record<string, string[]> = {
              fuel: ["petrol station", "Shell", "BP", "Esso", "Texaco", "TotalEnergies"],
              restaurant: ["restaurant"], fast_food: ["fast food"], cafe: ["cafe"],
              supermarket: ["supermarket"], convenience: ["convenience store"],
            };
            const jobs = amenities.slice(0, 4).flatMap((a) =>
              (words[a] ?? [a.replace(/_/g, " ")]).map((w) =>
                photonSearch({ q: w, center, bbox, osmTags: [`amenity:${a}`, `shop:${a}`], limit: 15 })
                  .catch(() => [] as PhotonHit[])));
            const seenIds = new Set<string>();
            hits = (await Promise.all(jobs)).flat().filter((h) => !seenIds.has(h.id) && !!seenIds.add(h.id));
          }
        } catch { /* empty */ }
        return new Response(JSON.stringify(hits.slice(0, limit)), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "photon" },
          status: 200,
        });
      }

      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const slim = elements
        .map((el: any) => ({
          id: `${el.type ?? "n"}${el.id}`,
          lat: typeof el?.lat === "number" ? el.lat : el?.center?.lat,
          lon: typeof el?.lon === "number" ? el.lon : el?.center?.lon,
          tags: el.tags ?? {},
        }))
        .filter((el: any) => typeof el.lat === "number" && typeof el.lon === "number");

      return new Response(JSON.stringify(slim), {
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
        },
        status: 200,
      });
    }

    let url: URL;

    if (body.kind === "search") {
      const q = body.q?.toString().trim();
      if (!q) {
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("extratags", "1");

      if (body.countryCode) {
        url.searchParams.set("countrycodes", body.countryCode);
      }

      if (body.viewbox) {
        url.searchParams.set("viewbox", body.viewbox);
      }

      const bounded = asBounded(body.bounded);
      if (bounded) {
        url.searchParams.set("bounded", bounded);
      }

      if (body.limit !== undefined && body.limit !== null) {
        const limit = Math.max(1, Math.min(50, Number(body.limit) || 1));
        url.searchParams.set("limit", String(limit));
      }
    } else if (body.kind === "reverse") {
      if (typeof body.lat !== "number" || typeof body.lon !== "number") {
        return new Response(JSON.stringify({ error: "Missing lat/lon" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }
      if (body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180) {
        return new Response(JSON.stringify({ error: "lat/lon out of range" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(body.lat));
      url.searchParams.set("lon", String(body.lon));
      url.searchParams.set("format", "json");
      url.searchParams.set("zoom", String(body.zoom ?? 3));
    } else {
      return new Response(JSON.stringify({ error: "Invalid kind" }), {
        headers: { ...cors, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const upstream = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)",
        "Accept": "application/json",
      },
    });

    const text = await upstream.text();

    // Nominatim often refuses cloud servers: answer from Photon (same OSM
    // data) in Nominatim's shape so the app doesn't notice.
    if (!upstream.ok && body.kind === "reverse") {
      console.warn("[PLACE-SEARCH] Nominatim reverse", upstream.status, "- using Photon");
      try {
        const r = await fetchWithTimeout(`https://photon.komoot.io/reverse?lat=${body.lat}&lon=${body.lon}`, {
          headers: { "User-Agent": "Blacktop/1.0 (https://blacktoplive.com)", "Accept": "*/*" },
        }, 6000);
        const j = await r.json();
        const pr = j?.features?.[0]?.properties ?? {};
        const shaped = {
          display_name: [pr.name, pr.street, pr.city, pr.state, pr.country].filter(Boolean).join(", "),
          address: {
            country_code: typeof pr.countrycode === "string" ? pr.countrycode.toLowerCase() : undefined,
            country: pr.country, state: pr.state, city: pr.city, road: pr.street, postcode: pr.postcode,
          },
        };
        return new Response(JSON.stringify(shaped), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "photon" }, status: 200,
        });
      } catch {
        return new Response(JSON.stringify({}), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "none" }, status: 200,
        });
      }
    }

    if (!upstream.ok && body.kind === "search") {
      console.warn("[PLACE-SEARCH] Nominatim", upstream.status, "- using Photon");
      const vb = (body.viewbox ?? "").split(",").map(Number);
      const hasBox = vb.length === 4 && vb.every(Number.isFinite);
      const bounded = asBounded(body.bounded) === "1";
      const center = hasBox ? { lat: (vb[1] + vb[3]) / 2, lon: (vb[0] + vb[2]) / 2 } : null;
      const hits = await photonSearch({
        q: String(body.q ?? "").trim(),
        center,
        bbox: hasBox && bounded ? [Math.min(vb[0], vb[2]), Math.min(vb[1], vb[3]), Math.max(vb[0], vb[2]), Math.max(vb[1], vb[3])] : null,
        limit: Math.max(1, Math.min(30, Number(body.limit) || 10)),
      }).catch(() => []);
      const shaped = hits.map((h) => ({
        place_id: h.id,
        lat: String(h.lat),
        lon: String(h.lon),
        name: h.tags.name ?? "",
        display_name: [h.tags.name, h.tags["addr:street"], h.tags["addr:city"], h.tags["addr:postcode"], h.tags.country].filter(Boolean).join(", "),
      }));
      return new Response(JSON.stringify(shaped), {
        headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "photon" },
        status: 200,
      });
    }

    if (!upstream.ok) {
      const rateLimited = upstream.status === 429 || upstream.status >= 500;
      if (rateLimited) {
        // Return shape matching what the client expects so it doesn't crash
        const fallback = body.kind === "search" ? [] : {};
        return new Response(JSON.stringify(fallback), {
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "X-Fallback": "rate_limited",
          },
          status: 200,
        });
      }
      console.error("[PLACE-SEARCH] Upstream failed:", {
        status: upstream.status,
        body: text.slice(0, 500),
      });
      return new Response(
        JSON.stringify({ error: "Search service temporarily unavailable" }),
        {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 503,
        },
      );
    }

    return new Response(text, {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
      status: 200,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[PLACE-SEARCH] ERROR:", detail);
    return new Response(JSON.stringify({ error: "Search failed. Please try again." }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
