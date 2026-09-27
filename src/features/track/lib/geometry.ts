import type { Gate, LatLng } from '../types';

/**
 * Flat-earth maths in a local frame (metres), accurate to well under a
 * centimetre over a race track's extent.
 */
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

export function toLocal(p: LatLng, ref: LatLng): { x: number; y: number } {
  return {
    x: (p.lng - ref.lng) * M_PER_DEG_LNG_EQ * Math.cos((ref.lat * Math.PI) / 180),
    y: (p.lat - ref.lat) * M_PER_DEG_LAT,
  };
}

export function metres(a: LatLng, b: LatLng): number {
  const p = toLocal(b, a);
  return Math.hypot(p.x, p.y);
}

/** How far past either end of a line a crossing still counts (GPS scatter). */
export const GATE_MARGIN_M = 8;

export interface GateHit {
  /** 0..1 along the movement from the previous fix to the current one. */
  frac: number;
  /** +1 / -1: which way the line was crossed. */
  dir: 1 | -1;
}

/**
 * Did the path prev→curr cross the gate? Standard segment intersection,
 * with the gate stretched by GATE_MARGIN_M at both ends.
 */
export function crossGate(prev: LatLng, curr: LatLng, gate: Gate): GateHit | null {
  const ref = gate.a;
  const p = toLocal(prev, ref);
  const q = toLocal(curr, ref);
  const b = toLocal(gate.b, ref); // a is the origin
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x;
  const sy = b.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  // prev + t*r = a + u*s
  const t = ((0 - p.x) * sy - (0 - p.y) * sx) / denom;
  const u = ((0 - p.x) * ry - (0 - p.y) * rx) / denom;
  const gateLen = Math.hypot(sx, sy) || 1;
  const m = GATE_MARGIN_M / gateLen;
  if (t < 0 || t > 1 || u < -m || u > 1 + m) return null;
  return { frac: t, dir: denom > 0 ? 1 : -1 };
}

/**
 * When, between two fixes, did the vehicle reach the crossing point?
 * Assumes constant acceleration between the fixes (speeds from the GPS
 * chip), which is much closer than linear time on braking/drive zones.
 * Falls back to linear when the speeds don't agree with the distance.
 */
export function crossingTime(
  t1: number,
  t2: number,
  frac: number,
  distM: number,
  v1: number | null,
  v2: number | null,
): number {
  const dt = (t2 - t1) / 1000;
  const linear = t1 + frac * (t2 - t1);
  if (dt <= 0 || distM <= 0 || v1 == null || v2 == null || v1 < 0 || v2 < 0) return linear;
  const implied = ((v1 + v2) / 2) * dt;
  if (Math.abs(implied - distM) / distM > 0.35) return linear;
  // Scale speeds so the kinematics cover exactly the measured distance.
  const k = distM / implied;
  const a1 = v1 * k;
  const a2 = v2 * k;
  const acc = (a2 - a1) / dt;
  const x = frac * distM;
  let tau: number;
  if (Math.abs(acc) < 1e-6) tau = a1 > 0 ? x / a1 : frac * dt;
  else {
    const disc = a1 * a1 + 2 * acc * x;
    tau = disc >= 0 ? (-a1 + Math.sqrt(disc)) / acc : frac * dt;
  }
  if (!Number.isFinite(tau)) return linear;
  return t1 + Math.min(dt, Math.max(0, tau)) * 1000;
}
