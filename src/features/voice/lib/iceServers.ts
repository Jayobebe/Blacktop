import { supabase } from '@/integrations/supabase/client';

/**
 * ICE servers for convoy voice.
 *
 * STUN alone only works when at least one rider is on a friendly network
 * (usually Wi-Fi). On mobile data both phones sit behind carrier-grade NAT and
 * audio only flows through a TURN relay — without one, the Supabase signalling
 * (and the speaking indicators) still work but nobody hears anything.
 *
 * Relay credentials come from the `turn-credentials` edge function
 * (Cloudflare Realtime TURN). The public Open Relay credentials this used to
 * hard-code were verified dead: the legacy host rejects them (TURN 400) and
 * the staticauth host never answers an allocation.
 */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Credentials are valid for hours; refresh well before that.
const CACHE_MS = 60 * 60 * 1000;

let cached: { servers: RTCIceServer[]; hasRelay: boolean; at: number } | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/** Servers for new peer connections. Sync so peer creation never waits; `loadIceServers` fills it. */
export function currentIceServers(): RTCIceServer[] {
  return cached?.servers ?? STUN_SERVERS;
}

/** Whether a TURN relay is available — false means mobile-data riders likely can't hear each other. */
export function hasRelay(): boolean {
  return cached?.hasRelay ?? false;
}

/** Fetches relay credentials (once per hour). Never throws; falls back to STUN only. */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.servers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('turn-credentials');
      const relays = !error && Array.isArray(data?.iceServers) ? (data.iceServers as RTCIceServer[]) : [];
      if (error) console.warn('[Voice] No TURN relay available:', error.message ?? error);
      cached = { servers: [...STUN_SERVERS, ...relays], hasRelay: relays.length > 0, at: Date.now() };
    } catch (err) {
      console.warn('[Voice] TURN credential fetch failed:', err);
      cached = { servers: STUN_SERVERS, hasRelay: false, at: Date.now() };
    } finally {
      inflight = null;
    }
    return cached!.servers;
  })();
  return inflight;
}
