/**
 * Card challenge geometry and scoring.
 *
 * Kept dependency-free so the map, the demo mockup and tests can all use it.
 */
import type { ChallengePoint, ChallengeResult } from '@/lib/challengeRun';

/** Countdown before the clock starts, both when setting and attempting. */
export const CHALLENGE_COUNTDOWN_MS = 5000;
/** How close to the finish point counts as crossing the line. */
export const FINISH_RADIUS_M = 40;
/** How far off the stored route a challenger may stray. */
export const DEVIATION_LIMIT_M = 120;
/** How long they may stay off route before the run is voided. */
export const DEVIATION_GRACE_MS = 15_000;
/**
 * Seconds shaved off the setter's recorded time: they have to stop and tap
 * Finish challenge, which a challenger never has to do.
 */
export const SETTER_STOP_ALLOWANCE_SEC = 5;
/** Badges awarded for beating a challenge. */
export const CHALLENGE_WIN_BADGES = 3;

const R = 6371000;

export function metersApart(a: ChallengePoint, b: ChallengePoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Shortest distance from a point to a line segment, in metres (local flat approx). */
function pointToSegmentMeters(p: ChallengePoint, a: ChallengePoint, b: ChallengePoint): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - bx * t, py - by * t);
}

/** Shortest distance from a point to the challenge polyline, in metres. */
export function distanceToRoute(p: ChallengePoint, route: ChallengePoint[]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) return metersApart(p, route[0]);
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const d = pointToSegmentMeters(p, route[i - 1], route[i]);
    if (d < best) best = d;
  }
  return best;
}

/** True once the rider is inside the finish line radius. */
export function hasCrossedFinish(p: ChallengePoint, finish: ChallengePoint | null): boolean {
  return !!finish && metersApart(p, finish) <= FINISH_RADIUS_M;
}

/** Trim a recorded GPS track down to a compact challenge route. */
export function compactRoute(points: ChallengePoint[], max = 300): ChallengePoint[] {
  const clean = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  if (clean.length <= max) return clean;
  const out: ChallengePoint[] = [];
  const last = clean.length - 1;
  for (let i = 0; i < max; i++) out.push(clean[Math.round((i / (max - 1)) * last)]);
  return out;
}

/** Won only when strictly faster than the setter's time. */
export function scoreAttempt(timeSec: number, targetSec: number, voided: boolean): ChallengeResult {
  if (voided) return 'void';
  return timeSec < targetSec ? 'won' : 'lost';
}

export function formatChallengeTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Signed delta string vs the target, e.g. "-0:12" (faster) or "+0:05". */
export function formatDelta(timeSec: number, targetSec: number): string {
  const diff = Math.round(timeSec - targetSec);
  const sign = diff < 0 ? '-' : '+';
  return `${sign}${formatChallengeTime(Math.abs(diff))}`;
}
