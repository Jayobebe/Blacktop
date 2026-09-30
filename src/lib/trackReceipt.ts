/**
 * Track-session summary stapled onto the ride it was part of (same hand-off
 * pattern as challenge receipts): the Track Pack sets it before ending the
 * ride, the ride tracker takes it when saving.
 */
export interface TrackReceipt {
  sessionId: string;
  trackName: string;
  laps: number;
  bestLapMs: number | null;
  /** Sum of best sectors across the session. */
  theoreticalMs: number | null;
}

let pending: TrackReceipt | null = null;

export function setPendingTrackReceipt(r: TrackReceipt | null) {
  pending = r;
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
