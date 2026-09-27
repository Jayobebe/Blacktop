import { supabase } from '@/integrations/supabase/client';
import type { Lap, PitMessage, TrackDef } from '../types';

/**
 * Racer ⇄ pit crew link over a realtime channel whose name is a random key
 * carried in the racer's QR. Anyone who scans it can watch (no account
 * needed beyond the app's anonymous session). Nothing is stored server-side.
 */
export const TRACK_QR_PREFIX = 'BTTRK1:';

export interface Telemetry {
  t: number; // racer device fix time
  now: number; // racer wall clock when sent (for clock offset)
  lat: number;
  lng: number;
  v: number;
  lean?: number;
  g?: number;
  lap: number;
  d: number;
  lapStartT: number | null;
  delta: number | null;
}

export interface RacerSnapshot {
  riderName: string;
  track: TrackDef;
  laps: Lap[];
  lapStartT: number | null;
  currentSplits: number[];
  now: number;
  running: boolean;
}

export type LinkMessage =
  | { type: 'hello'; crewId: string; name: string }
  | { type: 'state'; snap: RacerSnapshot }
  | { type: 'tele'; tele: Telemetry }
  | { type: 'lap'; lap: Lap }
  | { type: 'split'; index: number; ms: number; t: number }
  | { type: 'pit'; msg: PitMessage }
  | { type: 'ended' };

type Channel = ReturnType<typeof supabase.channel>;

export function parseTrackQr(raw: string): string | null {
  const t = raw.trim();
  if (!t.startsWith(TRACK_QR_PREFIX)) return null;
  const token = t.slice(TRACK_QR_PREFIX.length);
  return /^[a-f0-9]{32}$/.test(token) ? token : null;
}

export class TrackLink {
  private ch: Channel;
  private closed = false;
  constructor(
    readonly token: string,
    onMessage: (m: LinkMessage) => void,
    onStatus?: (ok: boolean) => void,
  ) {
    this.ch = supabase.channel(`track:${token}`, { config: { broadcast: { self: false } } });
    this.ch
      .on('broadcast', { event: 'm' }, ({ payload }) => {
        if (!this.closed && payload && typeof payload.type === 'string') onMessage(payload as LinkMessage);
      })
      .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
  }

  send(m: LinkMessage) {
    if (this.closed) return;
    void this.ch.send({ type: 'broadcast', event: 'm', payload: m });
  }

  close() {
    this.closed = true;
    void supabase.removeChannel(this.ch);
  }
}

export function newLinkToken() {
  return crypto.randomUUID().replace(/-/g, '');
}
