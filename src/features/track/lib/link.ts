import { supabase } from '@/integrations/supabase/client';
import type { Gate, Lap, PitMessage, PitStop, TrackDef } from '../types';

/**
 * Racer ⇄ pit crew link over a realtime channel whose name is a random key
 * carried in a QR. Anyone who scans it can watch (no account needed beyond
 * the app's anonymous session). Nothing is stored server-side.
 *
 * Either side can start it:
 *   - the racer shows their QR (TRACK_QR_PREFIX) and the pit crew scans it;
 *   - the pit crew picks or builds the track and shows theirs
 *     (PIT_QR_PREFIX); the racer scans it, joins that channel and is sent the
 *     track (`track`), ready to go to the grid.
 * Older apps ignore the `track` message and can't read a pit QR, so they keep
 * working the first way.
 */
export const TRACK_QR_PREFIX = 'BTTRK1:';
export const PIT_QR_PREFIX = 'BTTRKP1:';

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
  /** In the pit lane: the visit so far (lib/pits PitLive) and the limit (m/s). Absent on track and from older apps. */
  pit?: { inT: number; stoppedSince: number | null; stationaryMs: number; stops: number; overLimitMs: number; limit: number } | null;
}

export type RacerPhase = 'idle' | 'walking' | 'armed' | 'running';

/** The lap being walked / ridden to create a track. */
export interface WalkShape {
  trail: { lat: number; lng: number }[];
  startFinish: Gate | null;
  splits: Gate[];
  travelled: number;
  /** The lap has closed; the racer is placing the timing lines. */
  closed?: boolean;
}

export interface RacerSnapshot {
  phase: RacerPhase;
  walk: WalkShape | null;
  riderName: string;
  track: TrackDef | null;
  laps: Lap[];
  lapStartT: number | null;
  currentSplits: number[];
  now: number;
  running: boolean;
  /** Armed: on the grid (launch detection on); false while heading there. Missing from older apps. */
  inPosition?: boolean;
  /** Pit lane limit in force (m/s), and the pit stops so far. Missing from older apps. */
  pitLimit?: number;
  pitStops?: PitStop[];
  /** The track has pit lane timing lines. */
  pitTiming?: boolean;
  /** Rider's latest position (walking / on the grid). */
  pos?: { lat: number; lng: number } | null;
  gpsHz?: number;
}

export type LinkMessage =
  | { type: 'hello'; crewId: string; name: string }
  | { type: 'state'; snap: RacerSnapshot }
  | { type: 'tele'; tele: Telemetry }
  | { type: 'lap'; lap: Lap }
  | { type: 'split'; index: number; ms: number; t: number }
  | { type: 'pit'; msg: PitMessage }
  /** Pit crew → racer: the track the crew set up (pit-hosted links). */
  | { type: 'track'; track: TrackDef }
  /** Pit crew → racer: the pit lane speed limit, m/s. */
  | { type: 'pitLimit'; mps: number }
  /** Racer → crew at the end: the session (JSON, in parts; see sendSessionToCrew). */
  | { type: 'session'; id: string; part: number; parts: number; data: string }
  | { type: 'ended' };

type Channel = ReturnType<typeof supabase.channel>;

/** A pit crew's QR (they set the track): the link key, or null. */
export function parsePitQr(raw: string): string | null {
  const t = raw.trim();
  if (!t.startsWith(PIT_QR_PREFIX)) return null;
  const token = t.slice(PIT_QR_PREFIX.length);
  return /^[a-f0-9]{32}$/.test(token) ? token : null;
}

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

/**
 * A racer's session sent to the crew (`session` parts, joined), checked before
 * it's kept: numbers where numbers belong, sizes capped. Null if it isn't one.
 */
export function parseCrewSession(json: string): import('../types').TrackSession | null {
  try {
    const s = JSON.parse(json);
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (!s || typeof s.id !== 'string' || typeof s.trackName !== 'string' || !num(s.startedAt) || !num(s.endedAt)) return null;
    if (!Array.isArray(s.laps) || !Array.isArray(s.samples) || s.laps.length > 500 || s.samples.length > 20_000) return null;
    if (!s.laps.every((l: { n: unknown; ms: unknown; startT: unknown; endT: unknown }) => num(l.n) && num(l.ms) && num(l.startT) && num(l.endT))) return null;
    if (!s.samples.every((x: { t: unknown; lat: unknown; lng: unknown; v: unknown }) => num(x.t) && num(x.lat) && num(x.lng) && num(x.v))) return null;
    return {
      ...s,
      trackName: String(s.trackName).slice(0, 80),
      riderName: String(s.riderName ?? '').slice(0, 40),
      splitsCount: num(s.splitsCount) ? Math.min(30, s.splitsCount) : 0,
      pitStops: Array.isArray(s.pitStops) ? s.pitStops.slice(0, 50) : undefined,
      bikeId: undefined,
    };
  } catch {
    return null;
  }
}
