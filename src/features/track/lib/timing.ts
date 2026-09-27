import type { Lap, TelemetrySample, TrackDef } from '../types';
import { crossGate, crossingTime, metres, toLocal } from './geometry';

/** A lap faster than this is a GPS glitch or a pit-lane cut, not a lap. */
export const MIN_LAP_MS = 15_000;
/** Ignore a second crossing of the same line within this window. */
const REARM_MS = 4_000;
/** Fixes further apart than this make the crossing time less certain. */
const GAP_WARN_MS = 1_500;
/** Accuracy (m) above which a crossing is flagged low-confidence. */
const ACC_WARN_M = 15;

export interface Fix {
  t: number;
  lat: number;
  lng: number;
  /** m/s; derived from position change when the device doesn't report it. */
  speed: number | null;
  accuracy: number | null;
  lean?: number;
  g?: number;
}

export type TimingEvent =
  | { type: 'lapStart'; t: number }
  | { type: 'split'; index: number; ms: number; t: number }
  | { type: 'lap'; lap: Lap };

/** Fit windows (ms either side of a crossing), widest first. */
const FIT_WINDOWS_MS = [2000, 1200, 700, 400];
/** Minimum fit tolerance (m): residuals below this are GPS noise, not a bad fit. */
const FIT_TOL_MIN_M = 1.5;
/** Wait this long after a crossing before settling its time. */
const SETTLE_MS = 2000;

interface Pending {
  kind: 'sf' | 'split';
  index: number;
  prev: Fix;
  curr: Fix;
  frac: number;
  segM: number;
  vPrev: number | null;
  vNow: number | null;
  shaky: boolean;
}

/**
 * Lap / sector timer fed with raw GPS fixes.
 *
 * Each line crossing is settled about a second after it happens: the signed
 * distance to the line of every fix within ±1 s is fitted with a quadratic
 * and solved for zero, which averages out GPS scatter (more fixes = tighter).
 * With too few fixes (1 Hz GPS) it falls back to placing the crossing between
 * the two fixes either side using both fixes' speeds.
 */
export class LapTimer {
  private prev: Fix | null = null;
  private buffer: Fix[] = [];
  private pending: Pending[] = [];
  private dir: 1 | -1 | null = null;
  private lapStart: number | null = null;
  private lastSfT = -Infinity;
  private nextSplit = 0;
  private splitTimes: number[] = [];
  private lowConf = false;
  private lapMaxSpeed = 0;
  private lapMaxLean = 0;
  private lapN = 0;
  readonly laps: Lap[] = [];
  readonly samples: TelemetrySample[] = [];

  constructor(private readonly track: TrackDef) {}

  get lapStartT() {
    return this.lapStart;
  }
  get currentLapNumber() {
    return this.lapStart === null ? 0 : this.lapN + 1;
  }
  get distanceIntoLap() {
    return this.samples.length ? this.samples[this.samples.length - 1].d : 0;
  }
  get currentSplits() {
    return [...this.splitTimes];
  }

  bestLap(): Lap | null {
    return this.laps.filter((l) => l.valid).reduce<Lap | null>((b, l) => (!b || l.ms < b.ms ? l : b), null);
  }

  /** Best time for each sector across all valid laps (for the theoretical best). */
  bestSectors(): number[] {
    const n = this.track.splits.length + 1;
    const best: number[] = Array(n).fill(Infinity);
    for (const l of this.laps) {
      if (!l.valid || l.sectors.length !== n) continue;
      l.sectors.forEach((ms, i) => (best[i] = Math.min(best[i], ms)));
    }
    return best;
  }

  /** Settle anything still pending (e.g. when the session ends). */
  flush(): TimingEvent[] {
    const events: TimingEvent[] = [];
    while (this.pending.length) events.push(...this.resolve(this.pending.shift()!));
    return events;
  }

  feed(fix: Fix): TimingEvent[] {
    const events: TimingEvent[] = [];
    const prev = this.prev;
    if (prev && fix.t <= prev.t) return events;
    this.prev = fix;
    this.buffer.push(fix);
    while (this.buffer.length && this.buffer[0].t < fix.t - 6_000) this.buffer.shift();

    if (prev) {
      const segM = metres(prev, fix);
      const dtS = (fix.t - prev.t) / 1000;
      const vPrev = prev.speed ?? (dtS > 0 ? segM / dtS : null);
      const vNow = fix.speed ?? (dtS > 0 ? segM / dtS : null);
      const shaky = fix.t - prev.t > GAP_WARN_MS || (fix.accuracy ?? 0) > ACC_WARN_M || (prev.accuracy ?? 0) > ACC_WARN_M;
      const base = { prev, curr: fix, segM, vPrev, vNow, shaky };

      // Next sector split (only once a lap is under way / about to be).
      const splitIdx = this.nextSplit + this.pending.filter((p) => p.kind === 'split').length;
      const lapRunning = this.lapStart !== null || this.pending.some((p) => p.kind === 'sf');
      if (lapRunning && splitIdx < this.track.splits.length) {
        const hit = crossGate(prev, fix, this.track.splits[splitIdx]);
        if (hit) this.pending.push({ kind: 'split', index: splitIdx, frac: hit.frac, ...base });
      }
      const sf = crossGate(prev, fix, this.track.startFinish);
      if (sf && (this.dir === null || sf.dir === this.dir)) {
        if (this.dir === null) this.dir = sf.dir;
        this.pending.push({ kind: 'sf', index: -1, frac: sf.frac, ...base });
      }

      this.addSample(fix, vNow, segM);
    } else {
      this.addSample(fix, fix.speed, 0);
    }

    // Settle crossings once enough fixes after them have arrived.
    while (this.pending.length && fix.t - this.pending[0].curr.t >= SETTLE_MS) {
      events.push(...this.resolve(this.pending.shift()!));
    }
    return events;
  }

  /**
   * Crossing time from a fit over the fixes around it. Tries the widest
   * window first and narrows it when the path bends too much for a quadratic
   * (tight hairpins); with too few fixes it uses the two-fix kinematic time.
   */
  private settleTime(p: Pending): number {
    const gate = p.kind === 'sf' ? this.track.startFinish : this.track.splits[p.index];
    const kinematic = crossingTime(p.prev.t, p.curr.t, p.frac, p.segM, p.vPrev, p.vNow);
    const a = toLocal(gate.b, gate.a);
    const len = Math.hypot(a.x, a.y) || 1;
    const nx = -a.y / len;
    const ny = a.x / len;
    for (const w of FIT_WINDOWS_MS) {
      const win = this.buffer.filter((f) => f.t >= p.prev.t - w && f.t <= p.curr.t + w);
      if (win.length < 5) continue;
      const xs = win.map((f) => (f.t - kinematic) / 1000);
      const ys = win.map((f) => {
        const q = toLocal(f, gate.a);
        return q.x * nx + q.y * ny;
      });
      const coef = fitQuadratic(xs, ys);
      if (!coef) continue;
      const [c0, c1, c2] = coef;
      // How well the curve matches the fixes, vs how noisy the fixes are.
      const rms = Math.sqrt(xs.reduce((acc, x, i) => acc + (c0 + c1 * x + c2 * x * x - ys[i]) ** 2, 0) / xs.length);
      const accs = win.map((f) => f.accuracy ?? 5).sort((x, y) => x - y);
      const tol = Math.max(FIT_TOL_MIN_M, accs[Math.floor(accs.length / 2)] * 0.6);
      if (rms > tol) continue;
      let root: number | null = null;
      if (Math.abs(c2) < 1e-9) root = Math.abs(c1) > 1e-9 ? -c0 / c1 : null;
      else {
        const disc = c1 * c1 - 4 * c2 * c0;
        if (disc >= 0) {
          const r1 = (-c1 + Math.sqrt(disc)) / (2 * c2);
          const r2 = (-c1 - Math.sqrt(disc)) / (2 * c2);
          root = Math.abs(r1) < Math.abs(r2) ? r1 : r2;
        }
      }
      // Trust the fit only when it lands near where the fixes say the line was crossed.
      if (root === null || !Number.isFinite(root) || Math.abs(root) > 0.5 + (p.curr.t - p.prev.t) / 1000) continue;
      return kinematic + root * 1000;
    }
    return kinematic;
  }

  private resolve(p: Pending): TimingEvent[] {
    const events: TimingEvent[] = [];
    const tc = this.settleTime(p);

    if (p.kind === 'split') {
      if (this.lapStart === null || p.index !== this.nextSplit || tc <= this.lapStart) return events;
      const since = this.splitTimes.length ? this.splitTimes[this.splitTimes.length - 1] : this.lapStart;
      this.splitTimes.push(tc);
      if (p.shaky) this.lowConf = true;
      this.nextSplit++;
      events.push({ type: 'split', index: p.index, ms: Math.round(tc - since), t: tc });
      return events;
    }

    if (tc - this.lastSfT < REARM_MS) return events;
    if (this.lapStart !== null && tc - this.lapStart < MIN_LAP_MS) return events;
    this.lastSfT = tc;
    if (this.lapStart !== null) {
      events.push({ type: 'lap', lap: this.closeLap(tc, p.shaky) });
    }
    this.beginLap(tc);
    this.relabelFrom(tc, p);
    events.push({ type: 'lapStart', t: tc });
    return events;
  }

  /** Samples logged after the (just settled) crossing belong to the new lap. */
  private relabelFrom(tc: number, p: Pending) {
    const lapNo = this.lapN + 1;
    const cross = {
      lat: p.prev.lat + (p.curr.lat - p.prev.lat) * p.frac,
      lng: p.prev.lng + (p.curr.lng - p.prev.lng) * p.frac,
    };
    let i = this.samples.length - 1;
    while (i >= 0 && this.samples[i].t > tc) i--;
    let last = cross;
    let d = 0;
    for (let j = i + 1; j < this.samples.length; j++) {
      const s = this.samples[j];
      d += metres(last, s);
      last = s;
      s.lap = lapNo;
      s.d = d;
    }
  }

  private addSample(fix: Fix, v: number | null, segM: number) {
    const last = this.samples[this.samples.length - 1];
    const lap = this.lapStart === null ? 0 : this.lapN + 1;
    const d = last && last.lap === lap ? last.d + segM : 0;
    if (this.lapStart !== null) {
      if (v != null) this.lapMaxSpeed = Math.max(this.lapMaxSpeed, v);
      if (fix.lean != null) this.lapMaxLean = Math.max(this.lapMaxLean, Math.abs(fix.lean));
    }
    this.samples.push({ t: fix.t, lat: fix.lat, lng: fix.lng, v: v ?? 0, lean: fix.lean, g: fix.g, lap, d });
  }

  private beginLap(t: number) {
    this.lapStart = t;
    this.nextSplit = 0;
    this.splitTimes = [];
    this.lowConf = false;
    this.lapMaxSpeed = 0;
    this.lapMaxLean = 0;
  }

  private closeLap(endT: number, shaky: boolean): Lap {
    const start = this.lapStart!;
    const allSplits = this.splitTimes.length === this.track.splits.length;
    const marks = [start, ...this.splitTimes, endT];
    const sectors = allSplits ? marks.slice(1).map((m, i) => Math.round(m - marks[i])) : [];
    const lapNo = this.lapN + 1;
    const lapSamples = this.samples.filter((s) => s.lap === lapNo && s.t <= endT);
    this.lapN = lapNo;
    const lap: Lap = {
      n: lapNo,
      startT: start,
      endT,
      ms: Math.round(endT - start),
      sectors,
      // Missing a split means the lap didn't follow the circuit (cut / pit lane).
      valid: allSplits,
      lowConfidence: this.lowConf || shaky,
      maxSpeed: this.lapMaxSpeed,
      maxLean: this.lapMaxLean || undefined,
      distance: Math.round(lapSamples.length ? lapSamples[lapSamples.length - 1].d : 0),
    };
    this.laps.push(lap);
    return lap;
  }
}

/** Least-squares y = c0 + c1 x + c2 x^2. */
function fitQuadratic(xs: number[], ys: number[]): [number, number, number] | null {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    const x2 = x * x;
    s0 += 1; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  // Solve [[s0 s1 s2][s1 s2 s3][s2 s3 s4]] c = [t0 t1 t2] (Cramer's rule).
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const A = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const D = det(A);
  if (Math.abs(D) < 1e-12) return null;
  const col = (k: number) => A.map((row, i) => row.map((v, j) => (j === k ? [t0, t1, t2][i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/**
 * Live delta against a reference lap: how far ahead (−) or behind (+) the
 * current lap is at the same distance into the lap, in ms.
 */
export function liveDelta(reference: TelemetrySample[], refStartT: number, distance: number, elapsedMs: number): number | null {
  if (reference.length < 2) return null;
  // Measured from the reference lap's own line crossing, not its first fix.
  const t0 = refStartT;
  // Reference samples are ordered by distance within the lap.
  let lo = 0;
  let hi = reference.length - 1;
  if (distance <= reference[0].d) {
    const f = reference[0].d > 0 ? distance / reference[0].d : 0;
    return Math.round(elapsedMs - f * (reference[0].t - t0));
  }
  if (distance >= reference[hi].d) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (reference[mid].d <= distance) lo = mid;
    else hi = mid;
  }
  const a = reference[lo];
  const b = reference[hi];
  const f = b.d > a.d ? (distance - a.d) / (b.d - a.d) : 0;
  const refElapsed = a.t + f * (b.t - a.t) - t0;
  return Math.round(elapsedMs - refElapsed);
}

export function formatLap(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '–:––.–––';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

export function formatDelta(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '±0.000';
  const sign = ms < 0 ? '−' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`;
}
