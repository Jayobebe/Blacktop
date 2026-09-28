import type { Gate, LatLng } from '../types';
import { metres, toLocal } from './geometry';
import type { Fix } from './timing';

/** Half-width of a timing line (the line spans the whole track). */
export const WALK_GATE_HALF_M = 14;
/** Finishing a lap by hand joins it up from the first point within this of where it ends. */
const CLOSE_RADIUS_M = 25;
export const MIN_LAP_TRAVEL_M = 150;

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

/** How close (m) the trail has to come back to itself to close the lap. */
export const LOOP_CLOSE_M = 12;
/** Ignore the last this-many metres of trail when looking for the closure. */
const LOOP_IGNORE_RECENT_M = 100;
/** Once back on the line, how much further to go before closing (to find the closest pass). */
const LOOP_SETTLE_M = 25;
/** Coming back the same way: within this angle of the original direction. */
const LOOP_SAME_WAY = Math.cos((60 * Math.PI) / 180);

/**
 * Track builder, method 2: records a GPS trail and spots the moment it
 * comes back onto itself, heading the same way (so a hairpin running back
 * alongside a straight, or a figure-of-eight crossover, doesn't count). The
 * lap is the trail between the two passes; anything ridden before joining the
 * track (paddock, pit exit) is left off.
 */
export class LoopCloser {
  readonly pts: LatLng[] = [];
  private cum: number[] = [];
  private best: { seg: number; off: number; at: number } | null = null;

  get travelled() {
    return this.cum.length ? this.cum[this.cum.length - 1] : 0;
  }

  /** Adds a fix; returns the closed lap once found. */
  push(p: LatLng): LatLng[] | null {
    const n = this.pts.length;
    if (n && metres(this.pts[n - 1], p) < 2) return null;
    this.pts.push({ lat: p.lat, lng: p.lng });
    this.cum.push(n ? this.cum[n - 1] + metres(this.pts[n - 1], p) : 0);
    const total = this.travelled;
    if (total < MIN_LAP_TRAVEL_M) return null;

    const last = this.pts.length - 1;
    const dir = toLocal(p, this.pts[last - 1]);
    const dirLen = Math.hypot(dir.x, dir.y) || 1;
    for (let j = 0; j + 1 < last && this.cum[j + 1] <= total - LOOP_IGNORE_RECENT_M; j++) {
      const a = this.pts[j];
      const ab = toLocal(this.pts[j + 1], a);
      const abLen = Math.hypot(ab.x, ab.y) || 1;
      if ((ab.x * dir.x + ab.y * dir.y) / (abLen * dirLen) < LOOP_SAME_WAY) continue;
      const ap = toLocal(p, a);
      const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (abLen * abLen)));
      const off = Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t);
      if (off < LOOP_CLOSE_M && (!this.best || off < this.best.off)) this.best = { seg: j, off, at: last };
    }
    if (this.best && total - this.cum[this.best.at] >= LOOP_SETTLE_M) {
      return this.pts.slice(this.best.seg + 1, this.best.at + 1);
    }
    return null;
  }

  /**
   * Closes the lap by hand: from the earliest point near where the trail ends
   * (or the whole trail when it never came back), end joined to start.
   */
  forceClose(): LatLng[] | null {
    if (this.travelled < MIN_LAP_TRAVEL_M) return null;
    const end = this.pts[this.pts.length - 1];
    const total = this.travelled;
    for (let j = 0; j < this.pts.length && this.cum[j] <= total - LOOP_IGNORE_RECENT_M; j++) {
      if (metres(this.pts[j], end) <= CLOSE_RADIUS_M * 2) return this.pts.slice(j);
    }
    return this.pts.slice();
  }

  /** Distance from the latest fix back to where the trail started. */
  gapToStart(): number | null {
    return this.pts.length > 1 ? metres(this.pts[0], this.pts[this.pts.length - 1]) : null;
  }
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
