import type { Gate, Lap, LatLng, TelemetrySample, TrackDef, TrackSession } from '@/features/track/types';
import type { TrackReceipt } from '@/lib/trackReceipt';

/**
 * Demo-mode Track Pack data: one circuit and a six-lap session, generated
 * deterministically (no randomness) so the receipt on the demo ride always
 * matches the session it opens. Speed, lean and G come from the circuit's
 * curvature with grip and braking limits, so the traces read like real laps.
 */
export const DEMO_TRACK_ID = 'demo-track-01';
export const DEMO_TRACK_SESSION_ID = 'demo-track-session-01';
const NAME = 'Demo Circuit';
const CENTRE = { lat: 52.0715, lng: -1.0158 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((CENTRE.lat * Math.PI) / 180);
const G = 9.81;
const GRIP = 1.15; // lateral g at the limit
const ACCEL = 5.5; // m/s²
const BRAKE = 9.5; // m/s²
const V_MAX = 64; // m/s (~143 mph)
const HZ = 5;
/** Circuit corners (metres), run clockwise; a closed spline passes through them. */
const CONTROL: [number, number][] = [
  [-250, 0], [250, 0], [420, 30], [470, 150], [400, 250], [260, 230],
  [170, 300], [190, 430], [60, 500], [-120, 440], [-160, 300], [-330, 230], [-400, 90],
];
/** Sector lines at these fractions of the lap (start/finish at 0). */
const SPLIT_AT = [0.36, 0.7];
/** Pace per lap per sector: an out lap, a scruffy lap 5, best sectors spread over laps. */
const PACE = [
  [0.9, 0.92, 0.93],
  [0.955, 0.965, 0.96],
  [0.975, 0.99, 0.972],
  [0.992, 0.978, 0.985],
  [0.96, 0.955, 0.975],
  [0.985, 0.994, 0.99],
];

type P = { x: number; y: number };

function ll(p: P): LatLng {
  return { lat: CENTRE.lat + p.y / M_PER_DEG_LAT, lng: CENTRE.lng + p.x / M_PER_DEG_LNG };
}

/** Closed Catmull-Rom spline through CONTROL, dense, starting mid main straight. */
function centreline(perSeg = 80): P[] {
  const n = CONTROL.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => CONTROL[(i + k + n) % n]);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  // Start/finish halfway down the first straight.
  const k = Math.round(perSeg / 2);
  return [...out.slice(k), ...out.slice(0, k)];
}

function gateAt(pts: P[], i: number): Gate {
  const a = pts[(i - 1 + pts.length) % pts.length];
  const b = pts[(i + 1) % pts.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * 14;
  const ny = ((b.x - a.x) / len) * 14;
  const c = pts[i];
  return { a: ll({ x: c.x + nx, y: c.y + ny }), b: ll({ x: c.x - nx, y: c.y - ny }) };
}

/** Signed curvature at each point (1/m), lightly smoothed. */
function curvature(pts: P[]): number[] {
  const n = pts.length;
  const raw = pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lb = Math.hypot(c.x - b.x, c.y - b.y);
    const lc = Math.hypot(c.x - a.x, c.y - a.y);
    return (2 * cross) / (la * lb * lc || 1);
  });
  return raw.map((_, i) => {
    let s = 0;
    for (let k = -8; k <= 8; k++) s += raw[(i + k + n) % n];
    return s / 17;
  });
}

/** Grip-limited speed at each point, then acceleration and braking limits round the loop. */
function speedProfile(ds: number[], kappa: number[]): number[] {
  const n = ds.length;
  const v = kappa.map((k) => Math.min(V_MAX, Math.sqrt((GRIP * G) / Math.max(Math.abs(k), 1e-6))));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i <= n; i++) {
      const a = i - 1;
      const b = i % n;
      v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * ACCEL * ds[b]));
    }
    for (let i = n - 1; i >= 0; i--) {
      const b = (i + 1) % n;
      v[i] = Math.min(v[i], Math.sqrt(v[b] * v[b] + 2 * BRAKE * ds[b]));
    }
  }
  return v;
}

function build() {
  const pts = centreline();
  const n = pts.length;
  const ds = pts.map((p, i) => {
    const q = pts[(i - 1 + n) % n];
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  const total = ds.slice(1).reduce((a, b) => a + b, 0) + ds[0];
  const cum: number[] = [];
  ds.reduce((acc, d, i) => (cum[i] = i === 0 ? 0 : acc + d), 0);
  const kappa = curvature(pts);
  const vRef = speedProfile(ds, kappa);
  const splitIdx = SPLIT_AT.map((f) => cum.findIndex((c) => c >= f * total));

  const outline = pts.filter((_, i) => i % 6 === 0).map(ll);
  outline.push(outline[0]);
  const track: TrackDef = {
    id: DEMO_TRACK_ID,
    name: NAME,
    startFinish: gateAt(pts, 0),
    splits: splitIdx.map((i) => gateAt(pts, i)),
    createdAt: Date.now() - 12 * 86_400_000,
    outline,
  };

  // Lines up with demo ride 9 in history (~9.5 days ago).
  const startedAt = Date.now() - 9.45 * 86_400_000;
  const samples: TelemetrySample[] = [];
  const laps: Lap[] = [];
  let t = startedAt;
  PACE.forEach((pace, li) => {
    const lapN = li + 1;
    const lapStart = t;
    const bounds = [t];
    let d = 0;
    let maxV = 0;
    let maxLean = 0;
    let nextSample = t;
    let prevV = vRef[0] * pace[0];
    for (let k = 1; k <= n; k++) {
      const i = k % n;
      const sector = i === 0 ? SPLIT_AT.length : splitIdx.filter((s) => i > s).length;
      const v = vRef[i] * pace[Math.min(sector, pace.length - 1)];
      const dt = ds[i] / ((v + prevV) / 2);
      t += dt * 1000;
      d += ds[i];
      if (splitIdx.includes(i)) bounds.push(t);
      const lat = v * v * kappa[i];
      const lon = (v - prevV) / dt;
      prevV = v;
      const lean = (Math.atan(lat / G) * 180) / Math.PI;
      maxV = Math.max(maxV, v);
      maxLean = Math.max(maxLean, Math.abs(lean));
      if (t >= nextSample || i === 0) {
        nextSample = t + 1000 / HZ;
        samples.push({
          t: Math.round(t),
          ...ll(pts[i]),
          v,
          lean: Math.round(lean * 10) / 10,
          g: Math.round((Math.hypot(lat, lon) / G) * 100) / 100,
          lap: lapN,
          d,
        });
      }
    }
    bounds.push(t);
    laps.push({
      n: lapN,
      startT: Math.round(lapStart),
      endT: Math.round(t),
      ms: Math.round(t - lapStart),
      sectors: bounds.slice(1).map((b, j) => Math.round(b - bounds[j])),
      valid: true,
      lowConfidence: false,
      maxSpeed: maxV,
      maxLean: Math.round(maxLean),
      distance: d,
    });
  });

  const session: TrackSession = {
    id: DEMO_TRACK_SESSION_ID,
    trackId: DEMO_TRACK_ID,
    trackName: NAME,
    startedAt,
    endedAt: Math.round(t),
    laps,
    samples,
    splitsCount: SPLIT_AT.length,
    bikeId: 'demo-bike-01',
    riderName: 'Demo Rider',
  };
  const best = laps.reduce((b, l) => (l.ms < b.ms ? l : b));
  const bestSectors = laps[0].sectors.map((_, j) => Math.min(...laps.map((l) => l.sectors[j])));
  const receipt: TrackReceipt = {
    sessionId: session.id,
    trackName: NAME,
    laps: laps.length,
    bestLapMs: best.ms,
    theoreticalMs: bestSectors.reduce((a, b) => a + b, 0),
  };
  return { track, session, receipt };
}

let cache: ReturnType<typeof build> | null = null;
/** Built on first use. */
export function demoTrackData() {
  return (cache ??= build());
}
