import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://blacktoplive.com",
  "https://convoy-comms.lovable.app",
  "https://8006f12b-bc88-412a-bd3c-677561cc727f.lovableproject.com",
  "https://id-preview--8006f12b-bc88-412a-bd3c-677561cc727f.lovable.app",
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
  limit?: number;
};

type RouteBody = {
  kind: "route";
  // [lng, lat] pairs, in order from start to destination.
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

async function fetchOverpass(query: string) {
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "Blacktop-App/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
      }, 9000);

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
    const body = (await req.json()) as SearchBody | ReverseBody | OverpassBody | RouteBody;

    if (body.kind === "route") {
      const coords = Array.isArray(body.coordinates) ? body.coordinates : [];
      if (coords.length < 2 || !coords.every(isLngLat)) {
        return new Response(JSON.stringify({ error: "Need at least two valid [lng,lat] coordinates" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
      const routeUrl = new URL(`https://router.project-osrm.org/route/v1/driving/${path}`);
      routeUrl.searchParams.set("overview", "full");
      routeUrl.searchParams.set("geometries", "geojson");
      routeUrl.searchParams.set("alternatives", "false");
      routeUrl.searchParams.set("steps", "false");

      let osrm: any;
      try {
        const res = await fetchWithTimeout(routeUrl.toString(), {
          headers: { "User-Agent": "Blacktop-App/1.0", "Accept": "application/json" },
        }, 9000);
        const text = await res.text();
        if (!res.ok) throw new Error(`OSRM ${res.status}: ${text.slice(0, 200)}`);
        osrm = JSON.parse(text);
      } catch (e) {
        console.warn("[PLACE-SEARCH] Routing unavailable:", e instanceof Error ? e.message : e);
        return new Response(JSON.stringify({ error: "Routing unavailable" }), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "routing_unavailable" },
          status: 200,
        });
      }

      const route = osrm?.code === "Ok" ? osrm?.routes?.[0] : null;
      if (!route?.geometry) {
        return new Response(JSON.stringify({ error: "No route found" }), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
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

      const amenities = Array.isArray(body.amenities) ? body.amenities.filter(Boolean) : [];
      const filter24h = body.filter24h === true;
      
      // For 24h search, we don't require amenities
      if (amenities.length === 0 && !filter24h) {
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const radius = Math.max(1000, Math.min(50000, body.radius_m ?? 30000));
      const limit = Math.max(1, Math.min(100, body.limit ?? 60));

      let query: string;
      
      if (filter24h) {
        // Search for shops and petrol stations open 24 hours
        query = `
          [out:json][timeout:8];
          (
            node["shop"]["opening_hours"~"24/7|24 hours|24h"](around:${radius},${body.lat},${body.lon});
            node["amenity"="fuel"]["opening_hours"~"24/7|24 hours|24h"](around:${radius},${body.lat},${body.lon});
            node["amenity"="convenience"]["opening_hours"~"24/7|24 hours|24h"](around:${radius},${body.lat},${body.lon});
          );
          out body ${limit};
        `;
      } else {
        const regex = amenities.map(escapeRegexPart).join("|");
        query = `
          [out:json][timeout:8];
          (
            node["amenity"~"^(${regex})$"]["name"](around:${radius},${body.lat},${body.lon});
          );
          out body ${limit};
        `;
      }

      let data: any;
      try {
        data = await fetchOverpass(query);
      } catch (e) {
        console.warn("[PLACE-SEARCH] Overpass unavailable, returning empty:", e instanceof Error ? e.message : e);
        return new Response(JSON.stringify([]), {
          headers: { ...cors, "Content-Type": "application/json", "X-Fallback": "overpass_unavailable" },
          status: 200,
        });
      }

      const elements = Array.isArray(data?.elements) ? data.elements : [];
      // Return a slim payload for the client
      const slim = elements
        .filter((el: any) => typeof el?.lat === "number" && typeof el?.lon === "number")
        .map((el: any) => ({
          id: String(el.id),
          lat: el.lat,
          lon: el.lon,
          tags: el.tags ?? {},
        }));

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
        "User-Agent": "Blacktop-App/1.0",
        "Accept": "application/json",
      },
    });

    const text = await upstream.text();

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
