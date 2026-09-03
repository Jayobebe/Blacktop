import type { GpsPoint, RideSession } from '@/types/blacktop';

/**
 * Corner scoring — derives individual corners from a ride's GPS trace and
 * grades how well each one was ridden. Everything is computed on-device from
 * data the ride already stores; nothing extra is recorded or uploaded.
 */

export interface Corner {
  index: number;
  /** Direction of the turn. */
  direction: 'left' | 'right';
  /** Total heading change through the corner, degrees (absolute). */
  arc: number;
  /** Approximate corner radius in metres. */
  radius: number;
  /** Entry / apex / exit speeds in mph. */
  entrySpeed: number;
  apexSpeed: number;
  exitSpeed: number;
  /** Peak lean angle recorded through the corner, degrees (absolute). */
  maxLean: number;
  /** 0 – 100 score. */
  score: number;
  /** Seconds from ride start. */
  atSec: number;
}

export interface CornerReport {
  corners: Corner[];
  count: number;
  /** Mean score across all corners, 0 – 100. */
  averageScore: number;
  bestScore: number;
  /** Letter grade derived from the average score. */
  grade: string;
  /** Corners per mile — a rough "twistiness" measure of the route ridden. */
  cornersPerMile: number;
  /** Total degrees of direction change across the ride. */
  totalArc: number;
}

const R_EARTH = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function bearing(a: GpsPoint, b: GpsPoint): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceM(a: GpsPoint, b: GpsPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Signed shortest angle from a to b, degrees (-180 … 180). */
function deltaAngle(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

/** Minimum total heading change (degrees) for a bend to count as a corner. */
const MIN_ARC = 25;
/** Ignore near-stationary noise. */
const MIN_SPEED_MPH = 5;

export function analyseCorners(ride: Pick<RideSession, 'gpsPoints' | 'distance' | 'startedAt'>): CornerReport {
  const pts = (ride.gpsPoints ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const empty: CornerReport = {
    corners: [],
    count: 0,
    averageScore: 0,
    bestScore: 0,
    grade: '—',
    cornersPerMile: 0,
    totalArc: 0,
  };
  if (pts.length < 6) return empty;

  const startTs = pts[0].timestamp;

  // Per-segment bearings and lengths.
  const segs: { brg: number; len: number; from: number; to: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const len = distanceM(pts[i - 1], pts[i]);
    if (len < 2) continue; // GPS jitter while stopped
    segs.push({ brg: bearing(pts[i - 1], pts[i]), len, from: i - 1, to: i });
  }
  if (segs.length < 3) return empty;

  const corners: Corner[] = [];
  let totalArc = 0;

  let i = 0;
  while (i < segs.length - 1) {
    const d0 = deltaAngle(segs[i].brg, segs[i + 1].brg);
    if (Math.abs(d0) < 4) {
      i++;
      continue;
    }
    const sign = Math.sign(d0);
    let arc = 0;
    let length = 0;
    const startSeg = i;
    let j = i;
    // Grow while the turn keeps going the same way (small wobbles tolerated).
    while (j < segs.length - 1) {
      const d = deltaAngle(segs[j].brg, segs[j + 1].brg);
      if (Math.sign(d) !== sign && Math.abs(d) > 6) break;
      arc += Math.abs(d) * (Math.sign(d) === sign ? 1 : 0);
      length += segs[j].len;
      j++;
    }
    length += segs[j]?.len ?? 0;

    if (arc >= MIN_ARC && length > 8) {
      const fromIdx = segs[startSeg].from;
      const toIdx = segs[Math.min(j, segs.length - 1)].to;
      const slice = pts.slice(fromIdx, toIdx + 1);
      const speeds = slice.map((p) => Math.max(0, p.speed || 0));
      const entrySpeed = speeds[0] ?? 0;
      const exitSpeed = speeds[speeds.length - 1] ?? 0;
      const apexSpeed = Math.min(...speeds);
      const maxLean = Math.max(0, ...slice.map((p) => Math.abs(p.leanAngle ?? 0)));

      if (Math.max(...speeds) >= MIN_SPEED_MPH) {
        const radius = length / (toRad(arc) || 0.01);
        corners.push({
          index: corners.length,
          direction: sign > 0 ? 'right' : 'left',
          arc: Math.round(arc),
          radius: Math.round(radius),
          entrySpeed: Math.round(entrySpeed),
          apexSpeed: Math.round(apexSpeed),
          exitSpeed: Math.round(exitSpeed),
          maxLean: Math.round(maxLean),
          score: scoreCorner({ arc, radius, entrySpeed, apexSpeed, exitSpeed, maxLean }),
          atSec: Math.max(0, Math.round((slice[0].timestamp - startTs) / 1000)),
        });
        totalArc += arc;
      }
    }
    i = Math.max(j, i + 1);
  }

  if (!corners.length) return empty;

  const avg = corners.reduce((s, c) => s + c.score, 0) / corners.length;
  const miles = Math.max(0.1, ride.distance || 0);

  return {
    corners,
    count: corners.length,
    averageScore: Math.round(avg),
    bestScore: Math.max(...corners.map((c) => c.score)),
    grade: gradeFor(avg),
    cornersPerMile: Number((corners.length / miles).toFixed(1)),
    totalArc: Math.round(totalArc),
  };
}

/**
 * Score model (0 – 100), weighted towards the things that actually make a
 * corner well ridden: a smooth single arc, no mid-corner panic, and drive out.
 */
function scoreCorner(c: {
  arc: number;
  radius: number;
  entrySpeed: number;
  apexSpeed: number;
  exitSpeed: number;
  maxLean: number;
}): number {
  // Smoothness — how much speed was scrubbed between entry and apex.
  const scrub = c.entrySpeed > 0 ? (c.entrySpeed - c.apexSpeed) / c.entrySpeed : 0;
  const smooth = 1 - Math.min(1, Math.max(0, scrub - 0.12) / 0.5); // small trail-braking is fine

  // Drive — carrying speed out of the corner.
  const drive = Math.min(1, Math.max(0, (c.exitSpeed - c.apexSpeed) / Math.max(6, c.apexSpeed * 0.45)));

  // Commitment — lean used relative to what the corner asks for.
  const asked = Math.min(45, Math.max(8, (c.arc / 90) * 28 + (60 / Math.max(15, c.radius)) * 10));
  const commitment = c.maxLean > 0 ? Math.min(1, c.maxLean / asked) : 0.55; // no lean data: neutral

  // Pace — apex speed against a radius-appropriate reference.
  const refMph = Math.min(70, 4.2 * Math.sqrt(Math.max(8, c.radius)));
  const pace = Math.min(1, c.apexSpeed / refMph);

  const raw = smooth * 0.34 + drive * 0.24 + commitment * 0.22 + pace * 0.2;
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

function gradeFor(avg: number): string {
  if (avg >= 90) return 'S';
  if (avg >= 80) return 'A';
  if (avg >= 70) return 'B';
  if (avg >= 58) return 'C';
  if (avg >= 45) return 'D';
  return 'E';
}
