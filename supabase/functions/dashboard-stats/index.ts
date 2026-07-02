import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// IGNIS-VI is a local-only dashboard — only ever called from a dev server on localhost.
const ALLOWED_ORIGIN_PREFIXES = ["http://localhost:"];

function getCorsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGIN_PREFIXES.some((p) => origin.startsWith(p));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "http://localhost:5173",
    "Access-Control-Allow-Headers": "authorization, content-type, x-dashboard-key",
  };
}

// Aggregate-only counts for IGNIS-VI's App Analytics pillar. Protected by a shared
// secret (X-Dashboard-Key), not user auth — this never returns row-level/PII data,
// only counts, so a low-privilege shared key is an acceptable trust boundary. The
// real power (SUPABASE_SERVICE_ROLE_KEY, needed because RLS blocks anonymous reads
// of this data) stays server-side here and never reaches the browser.
serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const key = req.headers.get("x-dashboard-key");
  const expected = Deno.env.get("DASHBOARD_STATS_KEY");
  if (!expected || key !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 401,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [riders, activeConvoys, members] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("convoys").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("convoy_members").select("*", { count: "exact", head: true }),
    ]);

    const firstError = riders.error ?? activeConvoys.error ?? members.error;
    if (firstError) throw firstError;

    return new Response(
      JSON.stringify({
        totalRiders: riders.count ?? 0,
        activeConvoys: activeConvoys.count ?? 0,
        currentMemberships: members.count ?? 0,
      }),
      { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[DASHBOARD-STATS] ERROR:", detail);
    return new Response(JSON.stringify({ error: "Failed to load stats" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
