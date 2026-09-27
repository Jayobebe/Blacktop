import type { Gate, LatLng } from '../types';
import type { Fix } from './timing';
import { metres, toLocal } from './geometry';

/** Half-width of a walked timing line (the line spans the whole track). */
export const WALK_GATE_HALF_M = 14;
/** How close to the start/finish (after a real lap) before offering to close the track. */
export const CLOSE_RADIUS_M = 25;
export const MIN_LAP_TRAVEL_M = 150;

/** Direction of travel (radians, local frame) from recent fixes spanning ≥ 5 m. */
export function headingFrom(fixes: Fix[]): number | null {
  if (fixes.length < 2) return null;
  const last = fixes[fixes.length - 1];
  for (let i = fixes.length - 2; i >= 0; i--) {
    if (metres(fixes[i], last) >= 5) {
      const d = toLocal(last, fixes[i]);
      return Math.atan2(d.y, d.x);
    }
  }
  return null;
}

/** A timing line through `at`, square to the direction of travel. */
export function gateAcross(at: LatLng, heading: number, halfM = WALK_GATE_HALF_M): Gate {
  const nx = -Math.sin(heading);
  const ny = Math.cos(heading);
  const mLat = 110_540;
  const mLng = 111_320 * Math.cos((at.lat * Math.PI) / 180);
  return {
    a: { lat: at.lat - (ny * halfM) / mLat, lng: at.lng - (nx * halfM) / mLng },
    b: { lat: at.lat + (ny * halfM) / mLat, lng: at.lng + (nx * halfM) / mLng },
  };
}

export function gateCentre(g: Gate): LatLng {
  return { lat: (g.a.lat + g.b.lat) / 2, lng: (g.a.lng + g.b.lng) / 2 };
}

/** Keep an outline small enough to store and stream (every ≥ 4 m). */
export function simplify(points: LatLng[], minStepM = 4, max = 600): LatLng[] {
  const out: LatLng[] = [];
  for (const p of points) {
    if (!out.length || metres(out[out.length - 1], p) >= minStepM) out.push({ lat: p.lat, lng: p.lng });
  }
  if (out.length <= max) return out;
  const step = out.length / max;
  return Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]);
}

/**
 * Launch detection for a standing (or rolling) start: once the vehicle has
 * been still and then moves off with purpose, report the moment it started
 * moving (interpolated between fixes), not the moment it was noticed.
 */
export class LaunchDetector {
  private stillSince: number | null = null;
  private wasStill = false;
  private recent: Fix[] = [];

  /** Returns the launch time (device ms) once, or null. */
  feed(fix: Fix): number | null {
    this.recent.push(fix);
    if (this.recent.length > 30) this.recent.shift();
    const v = this.speedOf(fix);
    if (v === null) return null;
    if (v < 1.2) {
      if (this.stillSince === null) this.stillSince = fix.t;
      if (fix.t - this.stillSince >= 800) this.wasStill = true;
      return null;
    }
    this.stillSince = null;
    // Moving off: two fixes over 3 m/s (≈ 7 mph) or one clearly over 6 m/s.
    const moving = this.recent.slice(-2).every((f) => (this.speedOf(f) ?? 0) >= 3) || v >= 6;
    if (!moving) return null;
    if (!this.wasStill) return fix.t; // rolling start: go now
    // Back-date to where speed rose through ~0.5 m/s.
    for (let i = this.recent.length - 1; i > 0; i--) {
      const a = this.recent[i - 1];
      const b = this.recent[i];
      const va = this.speedOf(a) ?? 0;
      const vb = this.speedOf(b) ?? 0;
      if (va <= 0.5 && vb > 0.5) return a.t + ((0.5 - va) / (vb - va || 1)) * (b.t - a.t);
    }
    return this.recent[0].t;
  }

  private speedOf(f: Fix): number | null {
    if (f.speed != null) return f.speed;
    const i = this.recent.indexOf(f);
    if (i <= 0) return null;
    const p = this.recent[i - 1];
    const dt = (f.t - p.t) / 1000;
    return dt > 0 ? metres(p, f) / dt : null;
  }
}
