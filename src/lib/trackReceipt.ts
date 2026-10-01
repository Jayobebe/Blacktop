/**
 * Track-session summary stapled onto the ride it was part of: Track Day sets
 * it before ending the ride (and adds the board results once the record lap
 * is in), the ride tracker takes it when saving.
 */
export interface TrackReceipt {
  sessionId: string;
  trackName: string;
  laps: number;
  bestLapMs: number | null;
  /** Sum of best sectors across the session. */
  theoreticalMs: number | null;
  /** Pit lane visits, and the quickest one's lane time. */
  pitStops?: number;
  fastestPitMs?: number | null;
  /** Dog tags (Spectres) collected on the track's board this session, and the rank after it. */
  dogTags?: number;
  rank?: number | null;
  /** 3 Speed Demon per dog tag (banked with the ride). */
  badges?: import('@/types/convoy').BadgeType[];
}

let pending: TrackReceipt | null = null;

export function setPendingTrackReceipt(r: TrackReceipt | null) {
  pending = r;
}

/** Adds the board results to the receipt still waiting for its ride. */
export function amendPendingTrackReceipt(patch: Partial<TrackReceipt>) {
  if (pending) pending = { ...pending, ...patch };
}

export function takePendingTrackReceipt(): TrackReceipt | undefined {
  const r = pending ?? undefined;
  pending = null;
  return r;
}

/** Whether a Track Day session is waiting to be stapled to the ride being ended. */
export function hasPendingTrackReceipt(): boolean {
  return pending !== null;
}
