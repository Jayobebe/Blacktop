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

function asBounded(v: SearchBody["bounded"]): "0" | "1" | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === true) return "1";
  if (v === false) return "0";
  if (v === 1 || v === "1") return "1";
  if (v === 0 || v === "0") return "0";
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchBody | ReverseBody;

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
        // Nominatim asks for an identifying UA; server-side we can set it.
        "User-Agent": "Blacktop-App/1.0",
        "Accept": "application/json",
      },
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({
          error: "Upstream search failed",
          status: upstream.status,
          body: text.slice(0, 500),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
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
