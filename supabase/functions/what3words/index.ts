// what3words for the app (the key stays here). Signed-in riders only, rate
// limited per rider like place-search.
//
//   { action: "words", lat, lng, lang? }        → { enabled, words, nearest }
//   { action: "suggest", input, lat?, lng?, lang? } → { enabled, suggestions }
//   { action: "locate", words }                  → { enabled, lat, lng, nearest }
//
// Without the W3W_API_KEY secret every answer is { enabled: false } and the app
// shows no what3words anywhere.

import { createClient } from "npm:@supabase/supabase-js@2";
import { positionOf, suggest, w3wEnabled, wordsAt } from "../_shared/w3w.ts";

const ALLOWED_ORIGINS = new Set([
  "https://blacktoplive.com",
  "https://convoy-comms.lovable.app",
  "https://8006f12b-bc88-412a-bd3c-677561cc727f.lovableproject.com",
  "https://id-preview--8006f12b-bc88-412a-bd3c-677561cc727f.lovable.app",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://convoy-comms.lovable.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin") ?? ""), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers, status });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (error || !claims?.claims) return reply({ error: "Unauthorized" }, 401);
    // Search-as-you-type is the busiest caller (the app waits for three words first).
    const { data: allowed, error: rateErr } = await supabase.rpc("check_rate_limit", {
      _bucket: "what3words",
      _max_requests: 60,
      _window_seconds: 60,
    });
    if (rateErr || allowed === false) return reply({ error: "Too many requests, please slow down" }, 429);
  } catch {
    return reply({ error: "Unauthorized" }, 401);
  }

  if (!w3wEnabled) return reply({ enabled: false });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid body" }, 400);
  }
  const lang = typeof body.lang === "string" ? body.lang : undefined;

  if (body.action === "words") {
    if (!isNum(body.lat) || !isNum(body.lng)) return reply({ error: "Missing lat/lng" }, 400);
    const w = await wordsAt(body.lat, body.lng, lang);
    return reply({ enabled: true, words: w?.words ?? null, nearest: w?.nearest ?? null });
  }

  if (body.action === "suggest") {
    if (typeof body.input !== "string") return reply({ error: "Missing input" }, 400);
    const focus = isNum(body.lat) && isNum(body.lng) ? { lat: body.lat, lng: body.lng } : null;
    return reply({ enabled: true, suggestions: await suggest(body.input, focus, lang) });
  }

  if (body.action === "locate") {
    if (typeof body.words !== "string") return reply({ error: "Missing words" }, 400);
    const at = await positionOf(body.words);
    return reply({ enabled: true, ...(at ?? { lat: null, lng: null, nearest: null }) });
  }

  return reply({ error: "Invalid action" }, 400);
});
