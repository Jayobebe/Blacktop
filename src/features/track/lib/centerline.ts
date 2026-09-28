import type { Gate, LatLng, TrackDef } from '../types';
import { metres, toLocal } from './geometry';
import { gateAcross, gateCentre, simplify, WALK_GATE_HALF_M } from './walker';

/**
 * A closed lap as a line you can move along by distance: where you are at d
 * metres, which way the track runs there, and the nearest d to any point.
 * Used by the chase cam and to turn markers (distances) into timing gates.
 */

/** Evenly spaced points round a closed loop (first point not repeated). */
export function resampleLoop(points: LatLng[], stepM = 2): LatLng[] {
  if (points.length < 2) return points.slice();
  const ring = [...points, points[0]];
  const out: LatLng[] = [ring[0]];
  let carry = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const seg = metres(a, b);
    if (seg === 0) continue;
    let s = stepM - carry;
    while (s <= seg) {
      const f = s / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      s += stepM;
    }
    carry = seg - (s - stepM);
  }
  if (out.length > 2 && metres(out[out.length - 1], out[0]) < stepM * 0.5) out.pop();
  return out;
}

/** Circular moving average over ±`radius` points: takes the jitter out of a GPS lap. */
export function smoothLoop(points: LatLng[], radius = 3): LatLng[] {
  const n = points.length;
  if (n < radius * 2 + 3) return points.slice();
  return points.map((_, i) => {
    let lat = 0;
    let lng = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = points[(i + k + n) % n];
      lat += p.lat;
      lng += p.lng;
    }
    const c = radius * 2 + 1;
    return { lat: lat / c, lng: lng / c };
  });
}

/**
 * Douglas–Peucker: drop points that sit within `toleranceM` of the line
 * through their neighbours. Straights shrink to their ends; corners keep
 * their shape. For storing laps compactly; resample before using them.
 */
export function simplifyLine(points: LatLng[], toleranceM = 0.6): LatLng[] {
  if (points.length < 3) return points.slice();
  const ref = points[0];
  const xy = points.map((p) => toLocal(p, ref));
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = xy[a].x, ay = xy[a].y, bx = xy[b].x, by = xy[b].y;
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i].y) - (ax - xy[i].x) * (by - ay)) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export class Centerline {
  readonly pts: LatLng[];
  /** cum[i] = metres from pts[0] to pts[i]; cum[n] = full lap. */
  readonly cum: number[];
  readonly length: number;

  constructor(loop: LatLng[]) {
    this.pts = loop;
    this.cum = [0];
    for (let i = 1; i <= loop.length; i++) this.cum.push(this.cum[i - 1] + metres(loop[i - 1], loop[i % loop.length]));
    this.length = this.cum[loop.length] || 1;
  }

  wrap(d: number) {
    return ((d % this.length) + this.length) % this.length;
  }

  /** Index of the segment containing distance d (binary search). */
  private seg(d: number) {
    let lo = 0;
    let hi = this.pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  pointAt(d: number): LatLng {
    d = this.wrap(d);
    const i = this.seg(d);
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const len = this.cum[i + 1] - this.cum[i];
    const f = len > 0 ? (d - this.cum[i]) / len : 0;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }

  /** Direction of travel at d (radians, local frame: 0 = east, anticlockwise), over ±span metres. */
  headingAt(d: number, behind = 6, ahead = 6): number {
    const a = this.pointAt(d - behind);
    const b = this.pointAt(d + ahead);
    const v = toLocal(b, a);
    return Math.atan2(v.y, v.x);
  }

  /** Nearest distance along the line to p, and how far off the line p is. */
  project(p: LatLng): { d: number; off: number } {
    let best = { d: 0, off: Infinity };
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % this.pts.length];
      const ab = toLocal(b, a);
      const ap = toLocal(p, a);
      const len2 = ab.x * ab.x + ab.y * ab.y;
      const t = len2 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2)) : 0;
      const off = Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t);
      if (off < best.off) best = { d: this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t, off };
    }
    return best;
  }

  /** The loop from d round to d (for outlines that start at the start/finish). */
  from(d: number, stepM = 4): LatLng[] {
    const out: LatLng[] = [];
    for (let s = 0; s < this.length; s += stepM) out.push(this.pointAt(d + s));
    return out;
  }

  /** Points between two distances (running order, wrapping past the loop start). */
  slice(d0: number, d1: number, stepM = 3): LatLng[] {
    const span = this.wrap(d1 - d0) || this.length;
    const out: LatLng[] = [];
    for (let s = 0; s < span; s += stepM) out.push(this.pointAt(d0 + s));
    out.push(this.pointAt(d0 + span));
    return out;
  }
}

/** Compass bearing (degrees clockwise from north) for a local-frame heading. */
export function bearingOf(heading: number): number {
  return (90 - (heading * 180) / Math.PI + 360) % 360;
}

export interface Markers {
  /** Start/finish, metres along the line. */
  sf: number | null;
  /** Sector markers, metres along the line (any order; sorted when saved). */
  splits: number[];
}

/** Sector markers in running order, as metres after the start/finish. */
export function orderedSplits(line: Centerline, m: Markers): number[] {
  if (m.sf === null) return [...m.splits].sort((a, b) => a - b);
  return m.splits.map((d) => line.wrap(d - m.sf!)).sort((a, b) => a - b);
}

/** Sectors as [from, to] distances along the line, start/finish → marker 1 → … → start/finish. */
export function sectorsOf(line: Centerline, m: Markers): [number, number][] {
  if (m.sf === null) return [];
  const cuts = orderedSplits(line, m).map((s) => m.sf! + s);
  const bounds = [m.sf, ...cuts, m.sf + line.length];
  return bounds.slice(0, -1).map((d, i) => [d, bounds[i + 1]]);
}

export function gateAt(line: Centerline, d: number, halfM = WALK_GATE_HALF_M): Gate {
  return gateAcross(line.pointAt(d), line.headingAt(d), halfM);
}

/**
 * Markers → a saveable track: gates square to the line, outline starting at
 * the start/finish. Editing keeps the saved track's id, star and origin.
 */
export function buildTrack(line: Centerline, m: Markers, name: string, base?: TrackDef, meta?: Pick<TrackDef, 'source' | 'osmId'>): TrackDef {
  const sf = m.sf ?? 0;
  return {
    starred: base?.starred,
    source: meta?.source ?? base?.source,
    osmId: meta?.osmId ?? base?.osmId,
    id: base?.id ?? crypto.randomUUID(),
    name: name.trim().slice(0, 40) || `Track ${new Date().toLocaleDateString()}`,
    startFinish: gateAt(line, sf),
    splits: orderedSplits(line, m).map((s) => gateAt(line, sf + s)),
    createdAt: base?.createdAt ?? Date.now(),
    outline: simplify(line.from(sf, 3), 3, 800),
  };
}

/** Is this outline a usable closed lap (for re-editing a saved track)? */
export function isClosedLap(outline: LatLng[] | undefined): outline is LatLng[] {
  if (!outline || outline.length < 10) return false;
  let len = 0;
  for (let i = 1; i < outline.length; i++) len += metres(outline[i - 1], outline[i]);
  return len >= 100 && metres(outline[0], outline[outline.length - 1]) <= 40;
}

/** A saved track's gates as markers on its own outline. */
export function markersFromTrack(line: Centerline, track: TrackDef): Markers {
  return {
    sf: line.project(gateCentre(track.startFinish)).d,
    splits: track.splits.map((g) => line.project(gateCentre(g)).d),
  };
}

/** Distance between two points on the loop, whichever way round is shorter. */
export function loopGap(line: Centerline, a: number, b: number) {
  const d = line.wrap(a - b);
  return Math.min(d, line.length - d);
}
