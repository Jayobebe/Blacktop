import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function fetchOverpass(query: string) {
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "Blacktop-App/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchBody | ReverseBody | OverpassBody;

    if (body.kind === "overpass") {
      if (typeof body.lat !== "number" || typeof body.lon !== "number") {
        return new Response(JSON.stringify({ error: "Missing lat/lon" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const amenities = Array.isArray(body.amenities) ? body.amenities.filter(Boolean) : [];
      const filter24h = body.filter24h === true;
      
      // For 24h search, we don't require amenities
      if (amenities.length === 0 && !filter24h) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const radius = Math.max(1000, Math.min(50000, body.radius_m ?? 30000));
      const limit = Math.max(1, Math.min(100, body.limit ?? 60));

      let query: string;
      
      if (filter24h) {
        // Search for shops and petrol stations open 24 hours
        query = `
          [out:json][timeout:15];
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
          [out:json][timeout:10];
          (
            node["amenity"~"^(${regex})$"](around:${radius},${body.lat},${body.lon});
          );
          out body ${limit};
        `;
      }

      const data = await fetchOverpass(query);

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
          ...corsHeaders,
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        url.searchParams.set("limit", String(body.limit));
      }
    } else if (body.kind === "reverse") {
      if (typeof body.lat !== "number" || typeof body.lon !== "number") {
        return new Response(JSON.stringify({ error: "Missing lat/lon" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      // Return 200 with empty results + fallback flag so the client doesn't crash
      return new Response(
        JSON.stringify(
          rateLimited
            ? { results: [], fallback: true, reason: "rate_limited", status: upstream.status }
            : { error: "Upstream search failed", status: upstream.status, body: text.slice(0, 500) },
        ),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: rateLimited ? 200 : 502,
        },
      );
    }

    return new Response(text, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
