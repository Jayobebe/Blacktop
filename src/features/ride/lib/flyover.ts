import type { GpsPoint, LeanSample, GForceSample } from '@/types/blacktop';

export interface FlyoverFrame {
  lat: number;
  lng: number;
  bearing: number;
  /** Index into the source gps track (for progressive route drawing). */
  index: number;
  /** Elapsed ride seconds represented by this frame. */
  elapsed: number;
  speed: number; // mph
  distance: number; // miles travelled so far
  lean: number; // degrees (signed)
  gForce: number;
}

export interface MemberTrack {
  id: string;
  name?: string;
  color?: string;
  points: GpsPoint[];
}

const EARTH_RADIUS_MILES = 3958.8;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleAt<T extends { timestamp: number }>(samples: T[] | undefined, ts: number): T | null {
  if (!samples || samples.length === 0) return null;
  // Samples are chronological; a linear scan with a cached cursor is overkill
  // for the frame counts we build here (≤ 900).
  let best = samples[0];
  let bestDelta = Math.abs(samples[0].timestamp - ts);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].timestamp - ts);
    if (d < bestDelta) {
      best = samples[i];
      bestDelta = d;
    }
    if (samples[i].timestamp > ts && d > bestDelta) break;
  }
  return best;
}

/**
 * Resample a recorded GPS track into evenly-spaced camera keyframes so the whole
 * ride is compressed into `durationSec` of playback at `fps`.
 */
export function buildFlyoverFrames(
  points: GpsPoint[],
  opts: {
    durationSec: number;
    fps?: number;
    leanSamples?: LeanSample[];
    gForceSamples?: GForceSample[];
  },
): FlyoverFrame[] {
  const fps = opts.fps ?? 30;
  const clean = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (clean.length < 2) return [];

  // Cumulative distance so the stat card can show live mileage.
  const cumulative: number[] = [0];
  for (let i = 1; i < clean.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversineMiles(clean[i - 1], clean[i]);
  }

  const t0 = clean[0].timestamp;
  const t1 = clean[clean.length - 1].timestamp;
  const span = Math.max(1, t1 - t0);

  const totalFrames = Math.max(2, Math.round(durationClamp(opts.durationSec) * fps));
  const frames: FlyoverFrame[] = [];

  let cursor = 0;
  for (let f = 0; f < totalFrames; f++) {
    const progress = f / (totalFrames - 1);
    const ts = t0 + span * progress;

    while (cursor < clean.length - 2 && clean[cursor + 1].timestamp < ts) cursor++;

    const a = clean[cursor];
    const b = clean[Math.min(clean.length - 1, cursor + 1)];
    const segSpan = Math.max(1, b.timestamp - a.timestamp);
    const t = Math.max(0, Math.min(1, (ts - a.timestamp) / segSpan));

    const lat = lerp(a.lat, b.lat, t);
    const lng = lerp(a.lng, b.lng, t);

    // Bearing is derived after smoothing (below) so the camera never snaps at
    // GPS vertices — placeholder for now.
    const lean = sampleAt(opts.leanSamples, ts)?.angle ?? a.leanAngle ?? 0;
    const g = sampleAt(opts.gForceSamples, ts)?.g ?? 0;

    frames.push({
      lat,
      lng,
      bearing: 0,
      index: cursor,
      elapsed: (ts - t0) / 1000,
      speed: lerp(a.speed ?? 0, b.speed ?? 0, t),
      distance: lerp(cumulative[cursor], cumulative[Math.min(clean.length - 1, cursor + 1)], t),
      lean,
      gForce: g,
    });
  }

  smoothFrames(frames, fps);
  return frames;
}

/**
 * Where the ride was at a moment (ms), exactly on its track: the pin is placed from this, not from the frames
 * in between, which on a fast video are seconds of riding apart and cut every bend in a straight line.
 * `index` is the track point before it (for the trail drawn so far).
 */
export function trackAt(points: GpsPoint[], ts: number): { lat: number; lng: number; index: number } {
  if (!points.length) return { lat: 0, lng: 0, index: 0 };
  if (ts <= points[0].timestamp) return { lat: points[0].lat, lng: points[0].lng, index: 0 };
  const last = points.length - 1;
  if (ts >= points[last].timestamp) return { lat: points[last].lat, lng: points[last].lng, index: last };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timestamp <= ts) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = Math.max(0, Math.min(1, (ts - a.timestamp) / Math.max(1, b.timestamp - a.timestamp)));
  return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t), index: lo };
}

/**
 * Piecewise-linear resampling leaves visible kinks at every GPS vertex, which
 * reads as a choppy camera. Derive bearings from the track (with an unwrapped
 * moving average) for a continuous glide.
 */
function smoothFrames(frames: FlyoverFrame[], fps: number) {
  if (frames.length < 3) return;

  // Positions aren't smoothed: averaged over frames seconds of riding apart they cut every bend (the pin left
  // the road on a fast video). The camera's turning is smoothed below instead, and the pin is placed exactly
  // on the track between frames (trackAt).
  smoothSeries(frames, 'speed', Math.max(3, Math.round(fps * 0.8)), 1);
  smoothSeries(frames, 'lean', Math.max(3, Math.round(fps * 0.4)), 1);
  smoothSeries(frames, 'gForce', Math.max(3, Math.round(fps * 0.4)), 1);

  // Raw bearings from the smoothed track, looking a little ahead so the camera
  // leads the rider through corners rather than trailing them.
  const lookahead = Math.max(1, Math.round(fps * 0.35));
  const raw: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const a = frames[Math.max(0, i - 1)];
    const b = frames[Math.min(frames.length - 1, i + lookahead)];
    const bearing = a === b ? (raw[i - 1] ?? 0) : bearingBetween(a, b);
    raw.push(bearing);
  }

  // Unwrap so 359° → 1° averages through 0 instead of spinning backwards.
  const unwrapped: number[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = unwrapped[i - 1];
    const d = ((raw[i] - (((prev % 360) + 360) % 360) + 540) % 360) - 180;
    unwrapped.push(prev + d);
  }

  const bearingWindow = Math.max(5, Math.round(fps * 1.0));
  const smoothedBearings = movingAverage(movingAverage(unwrapped, bearingWindow), bearingWindow);
  for (let i = 0; i < frames.length; i++) frames[i].bearing = smoothedBearings[i];
}

function smoothSeries(frames: FlyoverFrame[], key: 'speed' | 'lean' | 'gForce', window: number, passes: number) {
  let values = frames.map(f => f[key]);
  for (let p = 0; p < passes; p++) values = movingAverage(values, window);
  for (let i = 0; i < frames.length; i++) frames[i][key] = values[i];
}

/** Centred moving average with edge clamping. */
function movingAverage(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      const idx = Math.max(0, Math.min(values.length - 1, j));
      sum += values[idx];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

function durationClamp(sec: number) {
  return Math.max(5, Math.min(60, sec || 10));
}

/** Position of a convoy member at a given absolute timestamp, or null before they start. */
export function memberPositionAt(track: MemberTrack, ts: number): { lat: number; lng: number } | null {
  const pts = track.points;
  if (!pts || pts.length === 0) return null;
  if (ts <= pts[0].timestamp) return { lat: pts[0].lat, lng: pts[0].lng };
  const last = pts[pts.length - 1];
  if (ts >= last.timestamp) return { lat: last.lat, lng: last.lng };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].timestamp >= ts) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (ts - a.timestamp) / Math.max(1, b.timestamp - a.timestamp);
      return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
    }
  }
  return { lat: last.lat, lng: last.lng };
}
