/**
 * Short-lived TURN relay credentials for convoy voice chat.
 *
 * Riders on mobile data sit behind carrier-grade NAT, so phone-to-phone
 * WebRTC audio only connects through a TURN relay. Static public relays
 * (Open Relay) stopped accepting their shared credentials, which left
 * cellular riders "connected" (speaking indicators worked over Supabase)
 * but with no audio path.
 *
 * Uses Cloudflare Realtime TURN. Required secrets:
 *   CLOUDFLARE_TURN_KEY_ID     – the TURN key id
 *   CLOUDFLARE_TURN_API_TOKEN  – that key's API token
 * Returns { iceServers: RTCIceServer[] } or 503 when not configured, in which
 * case the client falls back to STUN only (works on Wi-Fi, usually not on 4G/5G).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TTL_SECONDS = 6 * 60 * 60; // long enough for any ride; re-fetched per voice session

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!req.headers.get("Authorization")) return json({ error: "unauthorized" }, 401);

  const keyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
  const token = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");
  if (!keyId || !token) return json({ error: "turn not configured" }, 503);

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.error("[turn-credentials] Cloudflare error", res.status, await res.text());
      return json({ error: "turn provider error" }, 502);
    }
    const data = await res.json();
    // Newer endpoint: { iceServers: [...] }; legacy: { iceServers: { urls, username, credential } }.
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    if (iceServers.length === 0) return json({ error: "no ice servers returned" }, 502);
    return json({ iceServers, ttl: TTL_SECONDS });
  } catch (err) {
    console.error("[turn-credentials] failed", err);
    return json({ error: "turn provider unreachable" }, 502);
  }
});
