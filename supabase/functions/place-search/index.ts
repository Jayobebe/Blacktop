import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithTimeout, hasOwnGeoServer, upstreamHeaders, viaGeo } from "../_shared/upstream.ts";
import {
  buildLoop,
  buildTwisty,
  type LngLat,
  osrmRoute,
  type PlanOptions,
  type Prefs,
  readPrefs,
  routeFor,
  type RoutePrefs,
  type ScenicSpot,
  type Vibe,
} from "./routing.ts";

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

type PhotonHit = {
  id: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  /** OSM key / value of the place (e.g. amenity / fuel), and its country code (lower case). */
  key: string;
  value: string;
  country: string;
};

const PUBLIC_PHOTON = ["https://photon.komoot.io"];

/** Photon (komoot) OSM search: fast, tolerant of cloud servers, supports a bbox and tag filters. */
async function photonSearch(opts: {
  q: string;
  center?: { lat: number; lon: number } | null;
  bbox?: [number, number, number, number] | null;
  osmTags?: string[];
  limit?: number;
}): Promise<PhotonHit[]> {
  if (!opts.q) return [];
  const data = await viaGeo("photon", PUBLIC_PHOTON, async (base, own) => {
    const url = new URL(`${base}/api/`);
    url.searchParams.set("q", opts.q.slice(0, 100));
    url.searchParams.set("limit", String(opts.limit ?? 20));
    if (opts.center) {
      url.searchParams.set("lat", String(opts.center.lat));
      url.searchParams.set("lon", String(opts.center.lon));
    }
    if (opts.bbox) url.searchParams.set("bbox", opts.bbox.join(","));
    for (const t of opts.osmTags ?? []) url.searchParams.append("osm_tag", t);
    const res = await fetchWithTimeout(url.toString(), { headers: upstreamHeaders(own, { "Accept": "*/*" }) }, 7000);
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    return res.json();
  });
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
        key: String(p.osm_key ?? ""),
        value: String(p.osm_value ?? ""),
        country: typeof p.countrycode === "string" ? p.countrycode.toLowerCase() : "",
      };
    });
}

/** A Photon hit in the shape the app reads from Nominatim's search results. */
function photonAsNominatim(h: PhotonHit) {
  return {
    place_id: h.id,
    lat: String(h.lat),
    lon: String(h.lon),
    name: h.tags.name ?? "",
    display_name: [h.tags.name, h.tags["addr:street"], h.tags["addr:city"], h.tags["addr:postcode"], h.tags.country].filter(Boolean).join(", "),
    class: h.key,
    type: h.value,
  };
}

/** Reverse lookup from Photon, in the shape the app reads from Nominatim's (it uses the country). */
async function photonReverse(lat: number, lon: number) {
  const j = await viaGeo("photon", PUBLIC_PHOTON, async (base, own) => {
    const res = await fetchWithTimeout(`${base}/reverse?lat=${lat}&lon=${lon}`, { headers: upstreamHeaders(own, { "Accept": "*/*" }) }, 6000);
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    return res.json();
  });
  const pr = j?.features?.[0]?.properties ?? {};
  return {
    display_name: [pr.name, pr.street, pr.city, pr.state, pr.country].filter(Boolean).join(", "),
    address: {
      country_code: typeof pr.countrycode === "string" ? pr.countrycode.toLowerCase() : undefined,
      country: pr.country, state: pr.state, city: pr.city, road: pr.street, postcode: pr.postcode,
    },
  };
}

/** Photon search from a Nominatim-style request (viewbox, bounded, country codes, limit). */
async function photonForSearch(body: SearchBody) {
  const vb = (body.viewbox ?? "").split(",").map(Number);
  const hasBox = vb.length === 4 && vb.every(Number.isFinite);
  const bounded = asBounded(body.bounded) === "1";
  const center = hasBox ? { lat: (vb[1] + vb[3]) / 2, lon: (vb[0] + vb[2]) / 2 } : null;
  const countries = String(body.countryCode ?? "").toLowerCase().split(",").map((c) => c.trim()).filter(Boolean);
  const limit = Math.max(1, Math.min(30, Number(body.limit) || 10));
  const hits = await photonSearch({
    q: String(body.q ?? "").trim(),
    center,
    bbox: hasBox && bounded ? [Math.min(vb[0], vb[2]), Math.min(vb[1], vb[3]), Math.max(vb[0], vb[2]), Math.max(vb[1], vb[3])] : null,
    // Ask for extra when filtering by country afterwards (Photon has no country filter).
    limit: countries.length ? Math.min(50, limit * 3) : limit,
  });
  return hits
    .filter((h) => !countries.length || !h.country || countries.includes(h.country))
    .slice(0, limit)
    .map(photonAsNominatim);
}

function boxAround(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 110540;
  const dLon = radiusM / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// overpass-api.de answers 406 to "Accept: application/json" and wants a
// contactable User-Agent; kumi.systems was timing out, so it goes last.
const PUBLIC_OVERPASS = [
  "https://overpass-api.de",
  "https://overpass.private.coffee",
  "https://overpass.kumi.systems",
];

/** Overpass: our own server first (when set up), then the public mirrors in turn. */
async function fetchOverpass(query: string, timeoutMs = 9000) {
  return viaGeo("overpass", PUBLIC_OVERPASS, async (base, own) => {
    const res = await fetchWithTimeout(`${base}/api/interpreter`, {
      method: "POST",
      headers: upstreamHeaders(own, { "Content-Type": "application/x-www-form-urlencoded", "Accept": "*/*" }),
      body: `data=${encodeURIComponent(query)}`,
    }, timeoutMs);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  });
}

/** Viewpoints, peaks and waterfalls round a point (scenic loops), best-effort. */
async function scenicSpots(lat: number, lng: number, radiusKm: number): Promise<ScenicSpot[]> {
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

/**
 * Which engine plans routes. Until our own geo server is set up nothing
 * changes: OSRM as before (Valhalla only for avoid-preferences and bikes).
 * With it, Valhalla routes, and twisty / loop planning tries both engines and
 * keeps the best on Valhalla's road data.
 */
const PLAN: PlanOptions = { engine: hasOwnGeoServer ? "both" : "osrm", scenicSpots };

/**
 * With both engines on our own server, a route's ETA is given as a range: the
 * two engines time the same trip differently, and a window is more honest than
 * one precise, wrong time. OSRM's opinion only counts where it would ride the
 * same roads: not for bikes or avoid-preferences (it can't do either), and not
 * when its route comes out more than 15% longer or shorter.
 */
function secondOpinion(coords: LngLat[], p: Prefs): Promise<{ duration: number; distance: number } | null> {
  if (PLAN.engine !== "both" || p.vehicle === "bicycle" || Object.values(p.avoid).some(Boolean)) return Promise.resolve(null);
  return osrmRoute(coords).catch(() => null);
}

function etaRange(route: { duration: number; distance: number }, other: { duration: number; distance: number } | null): [number, number] | null {
  if (!other || !(other.duration > 0) || !(route.duration > 0)) return null;
  if (Math.abs(other.distance - route.distance) > route.distance * 0.15) return null;
  return [Math.min(route.duration, other.duration), Math.max(route.duration, other.duration)];
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
        plan = await buildTwisty(coords as LngLat[], readPrefs(body), PLAN);
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
        best = await buildLoop(lat, lng, distanceKm, vibe, readPrefs(body), PLAN);
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
      const prefs = { ...readPrefs(body), steps: body.steps === true };
      // Asked at the same time as the route, for the ETA range (null without our own server).
      const other = secondOpinion(coords as LngLat[], prefs);
      try {
        route = await routeFor(coords as LngLat[], prefs, PLAN.engine);
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

      const range = etaRange(route, await other);

      return new Response(
        JSON.stringify({
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
          ...(legs ? { legs } : {}),
          // [soonest, latest] seconds, only with our own server (see etaRange).
          ...(range ? { durationRange: range } : {}),
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

    // With our own geo server, search and reverse come from its Photon (no
    // Nominatim: its public server allows one request a second in total, and a
    // self-hosted one is far heavier to run). Without it, Nominatim as before.
    if (hasOwnGeoServer && (body.kind === "search" || body.kind === "reverse")) {
      const json = { ...cors, "Content-Type": "application/json" };
      if (body.kind === "search") {
        const q = body.q?.toString().trim();
        const results = q ? await photonForSearch(body).catch(() => []) : [];
        return new Response(JSON.stringify(results), { headers: { ...json, "Cache-Control": "public, max-age=30" }, status: 200 });
      }
      const { lat, lon } = body;
      if (typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return new Response(JSON.stringify({ error: "Invalid lat/lon" }), { headers: json, status: 400 });
      }
      const place = await photonReverse(lat, lon).catch(() => ({}));
      return new Response(JSON.stringify(place), { headers: json, status: 200 });
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
        const shaped = await photonReverse(body.lat, body.lon);
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
