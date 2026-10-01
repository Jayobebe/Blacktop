import type { Gate, LatLng, PitStop, TrackDef } from '../types';
import { Centerline, resampleLoop } from './centerline';
import { crossGate, metres, toLocal } from './geometry';

/**
 * Pit lane timing for Track Day.
 *
 * Where the pit lane is comes from the map (the circuit library's pit lanes,
 * or the pit roads the map builder found): `pitGates` puts a pit-in and a
 * pit-out line across the pit lane itself, set back from where it meets the
 * track, so a rider who stays out never crosses them.
 *
 * `PitTracker` then follows a rider through the pits: lane time (in → out),
 * every stop in the box (GPS speed near zero, confirmed by the phone feeling
 * no movement, since GPS speed jitters when standing still), when they began
 * braking for it and the moment they launched out of it (a G spike, which is
 * sharper than GPS), and how long they spent over the pit speed limit.
 */

/** Default pit lane limits by the rider's units (the usual track-day figures). */
export const DEFAULT_PIT_LIMIT = { kph: 60 / 3.6, mph: 40 * 0.44704 } as const;

/** Half the width of a pit line (m): pit lanes are a lane or two wide. */
const PIT_GATE_HALF_M = 6;
/** How far into the pit lane (m) the lines start looking, and how far they may go. */
const PIT_GATE_IN_M = 20;
const PIT_GATE_MAX_M = 300;
/** A pit line's ends must be at least this far (m) off the racing line (past a rider on the track's edge). */
const CLEAR_OF_TRACK_M = 6;
/** Pit lines stretch only this much (m) past their ends (timing lines on track allow 8). */
const PIT_GATE_MARGIN_M = 2;
/** A pit lane end this close (m) to the lap is where it joins the track. */
const JOIN_M = 25;

/** Below this (m/s, ~3 km/h) the bike may be stopped... */
const STILL_V = 0.8;
/** ...and the phone confirms it when dynamic G stays under this. */
const STILL_G = 0.12;
/** Stopped once both have held this long (ms). */
const STILL_MS = 1000;
/** Moving again: a push of this much G, or this speed (m/s). */
const LAUNCH_G = 0.2;
const LAUNCH_V = 1.5;
/** Over the limit counts from this much above it (m/s, GPS noise). */
const LIMIT_SLACK = 0.5;

function gateAcross(at: LatLng, heading: number, half: number): Gate {
  // Perpendicular to the lane's heading (radians, x east / y north).
  const px = -Math.sin(heading);
  const py = Math.cos(heading);
  const off = (dx: number, dy: number): LatLng => ({
    lat: at.lat + dy / 110_540,
    lng: at.lng + dx / (111_320 * Math.cos((at.lat * Math.PI) / 180)),
  });
  return { a: off(-px * half, -py * half), b: off(px * half, py * half) };
}

/**
 * Pit-in and pit-out lines for a track from its pit lane lines, or null when
 * there's no usable pit lane. Entry is the end the lap reaches just before the
 * start/finish, exit the one just after it.
 */
/** Joins pit lane pieces whose ends meet (within 5 m) into continuous lines. */
export function chain(lines: LatLng[][]): LatLng[][] {
  const out = lines.map((l) => [...l]);
  let joined = true;
  while (joined) {
    joined = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i];
        const b = out[j];
        const ends: [LatLng, LatLng, () => LatLng[]][] = [
          [a[a.length - 1], b[0], () => [...a, ...b.slice(1)]],
          [a[a.length - 1], b[b.length - 1], () => [...a, ...[...b].reverse().slice(1)]],
          [a[0], b[b.length - 1], () => [...b, ...a.slice(1)]],
          [a[0], b[0], () => [...[...b].reverse(), ...a.slice(1)]],
        ];
        for (const [p, q, merge] of ends) {
          if (metres(p, q) <= 5) {
            out[i] = merge();
            out.splice(j, 1);
            joined = true;
            break outer;
          }
        }
      }
    }
  }
  return out;
}

export function pitGates(track: Pick<TrackDef, 'outline' | 'startFinish'>, pitLines: LatLng[][]): { pitIn: Gate; pitOut: Gate; pitLane: LatLng[][] } | null {
  const lines = chain(pitLines.filter((l) => l.length >= 2));
  if (!track.outline || track.outline.length < 3 || !lines.length) return null;
  const line = new Centerline(resampleLoop(track.outline, 2));
  const sfMid = { lat: (track.startFinish.a.lat + track.startFinish.b.lat) / 2, lng: (track.startFinish.a.lng + track.startFinish.b.lng) / 2 };
  const sfD = line.project(sfMid).d;
  const rel = (d: number) => (((d - sfD) % line.length) + line.length) % line.length;

  // Every pit line end that meets the track: where the lane leaves or rejoins it.
  const joins: { line: LatLng[]; fromStart: boolean; d: number }[] = [];
  for (const l of lines) {
    for (const fromStart of [true, false]) {
      const p = fromStart ? l[0] : l[l.length - 1];
      const hit = line.project(p);
      if (hit.off <= JOIN_M) joins.push({ line: l, fromStart, d: rel(hit.d) });
    }
  }
  if (joins.length < 2) return null;
  // Entry: the join nearest the end of the lap; exit: nearest its start.
  const entry = joins.reduce((a, b) => (b.d > a.d ? b : a));
  const exit = joins.reduce((a, b) => (b.d < a.d ? b : a));
  if (entry === exit) return null;

  const gateOn = (j: (typeof joins)[number]): Gate | null => {
    const pts = j.fromStart ? j.line : [...j.line].reverse();
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = metres(pts[i - 1], pts[i]);
      // Step along this segment in 5 m increments once we're far enough in.
      for (let s = 0; s < seg; s += 5) {
        const along = walked + s;
        if (along < PIT_GATE_IN_M) continue;
        if (along > PIT_GATE_MAX_M) return null;
        const f = s / seg;
        const at = { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f };
        const v = toLocal(pts[i], pts[i - 1]);
        const gate = gateAcross(at, Math.atan2(v.y, v.x), PIT_GATE_HALF_M);
        if (line.project(gate.a).off >= CLEAR_OF_TRACK_M && line.project(gate.b).off >= CLEAR_OF_TRACK_M) return gate;
      }
      walked += seg;
    }
    return null;
  };
  const pitIn = gateOn(entry);
  const pitOut = gateOn(exit);
  return pitIn && pitOut ? { pitIn, pitOut, pitLane: lines } : null;
}

/**
 * The start/finish line carried on until it crosses the pit lane (plus a few
 * metres), like a circuit's timing loop, so a lap through the pits still
 * counts; null when the pit lane doesn't run past the line (within 150 m).
 */
export function startFinishAcrossPits(sf: Gate, pitLines: LatLng[][]): Gate | null {
  const v = toLocal(sf.b, sf.a);
  const len = Math.hypot(v.x, v.y) || 1;
  const ux = v.x / len;
  const uy = v.y / len;
  // How far along the line (from a, in metres) it meets each pit line segment.
  const hits: number[] = [];
  for (const l of pitLines) {
    for (let i = 1; i < l.length; i++) {
      const p = toLocal(l[i - 1], sf.a);
      const q = toLocal(l[i], sf.a);
      const rx = q.x - p.x;
      const ry = q.y - p.y;
      const den = ux * ry - uy * rx;
      if (Math.abs(den) < 1e-9) continue;
      const t = (p.x * ry - p.y * rx) / den; // along the start/finish line
      const s = (p.x * uy - p.y * ux) / den; // along the pit segment
      if (s >= 0 && s <= 1 && t > -150 && t < len + 150) hits.push(t);
    }
  }
  if (!hits.length) return null;
  const lo = Math.min(0, ...hits) - (Math.min(...hits) < 0 ? 6 : 0);
  const hi = Math.max(len, ...hits) + (Math.max(...hits) > len ? 6 : 0);
  const at = (t: number): LatLng => ({
    lat: sf.a.lat + (uy * t) / 110_540,
    lng: sf.a.lng + (ux * t) / (111_320 * Math.cos((sf.a.lat * Math.PI) / 180)),
  });
  return { a: at(lo), b: at(hi) };
}

/** Whether a position is in the pit lane (on a pit line and off the racing line). */
export function onPitLane(track: TrackDef, p: LatLng): boolean {
  if (!track.pitLane?.length || !track.outline) return false;
  const near = track.pitLane.some((l) => {
    for (let i = 1; i < l.length; i++) {
      const a = toLocal(l[i - 1], p);
      const b = toLocal(l[i], p);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / L)) : 0;
      if (Math.hypot(a.x + t * dx, a.y + t * dy) < 8) return true;
    }
    return false;
  });
  return near && new Centerline(resampleLoop(track.outline, 2)).project(p).off > CLEAR_OF_TRACK_M;
}

export interface PitFix {
  t: number;
  lat: number;
  lng: number;
  /** m/s */
  v: number;
}

export type PitEvent = { type: 'pitIn'; t: number } | { type: 'pitOut'; stop: PitStop } | { type: 'stopped'; t: number } | { type: 'moving'; t: number };

/** The live pit visit, for the racer's screen and the pit crew. */
export interface PitLive {
  inT: number;
  /** When the current stop began (null while moving). */
  stoppedSince: number | null;
  /** Stopped time so far this visit, finished stops only (ms). */
  stationaryMs: number;
  stops: number;
  overLimitMs: number;
  maxSpeed: number;
}

export class PitTracker {
  private prev: PitFix | null = null;
  private visit: (PitStop & { stillSince: number | null; stopping: { from: number; to: number | null; brakeT: number | null }[] }) | null = null;
  /** Recent speeds, to find where braking for a stop began. */
  private speeds: { t: number; v: number }[] = [];
  private lastG = 0;
  private lastGT = 0;
  readonly stops: PitStop[] = [];
  private count = 0;

  constructor(
    private readonly track: TrackDef,
    /** Pit lane speed limit, m/s. */
    public limit: number,
  ) {}

  get available() {
    return !!(this.track.pitIn && this.track.pitOut);
  }
  get inPit() {
    return this.visit !== null;
  }
  get live(): PitLive | null {
    const v = this.visit;
    if (!v) return null;
    const stopping = v.stopping[v.stopping.length - 1];
    return {
      inT: v.inT,
      stoppedSince: stopping && stopping.to === null ? stopping.from : null,
      stationaryMs: v.stationaryMs,
      stops: v.stopping.length,
      overLimitMs: v.overLimitMs,
      maxSpeed: v.maxSpeed,
    };
  }

  /** The session started (launched) in the pit lane: the visit starts there. */
  startInPit(t: number) {
    if (!this.visit) this.open(t, true);
  }

  /** Latest dynamic G (gravity-free magnitude) from the phone, many times a second. */
  feedG(t: number, g: number): PitEvent[] {
    this.lastG = g;
    this.lastGT = t;
    const v = this.visit;
    if (!v) return [];
    const stopping = v.stopping[v.stopping.length - 1];
    // A push out of the box: the launch is when the phone feels it.
    if (stopping && stopping.to === null && g >= LAUNCH_G) return this.launch(t);
    // Still: GPS slow and the phone calm for long enough.
    if (this.prev && this.prev.v < STILL_V && g < STILL_G) {
      if (v.stillSince === null) v.stillSince = t;
      if (t - v.stillSince >= STILL_MS && (!stopping || stopping.to !== null)) return this.stop(v.stillSince);
    } else if (g >= STILL_G) v.stillSince = null;
    return [];
  }

  feedFix(fix: PitFix): PitEvent[] {
    const prev = this.prev;
    this.prev = fix;
    this.speeds.push({ t: fix.t, v: fix.v });
    while (this.speeds.length && this.speeds[0].t < fix.t - 20_000) this.speeds.shift();
    if (!prev || !this.available) return [];
    const events: PitEvent[] = [];
    const dt = fix.t - prev.t;

    if (!this.visit) {
      const hit = crossGate(prev, fix, this.track.pitIn!, PIT_GATE_MARGIN_M);
      if (hit) {
        events.push(...this.open(prev.t + dt * hit.frac, false));
      }
      return events;
    }

    const v = this.visit;
    v.maxSpeed = Math.max(v.maxSpeed, fix.v);
    if (fix.v > this.limit + LIMIT_SLACK) v.overLimitMs += dt;
    // Moving again by GPS (when the phone missed the push).
    const stopping = v.stopping[v.stopping.length - 1];
    if (stopping && stopping.to === null && fix.v >= LAUNCH_V) events.push(...this.launch(fix.t - dt / 2));
    // No G for a while (sensors off): stop by GPS alone.
    if (fix.t - this.lastGT > 2000) events.push(...this.feedG(fix.t, fix.v < STILL_V ? 0 : this.lastG));

    const out = crossGate(prev, fix, this.track.pitOut!, PIT_GATE_MARGIN_M);
    if (out) events.push(this.close(prev.t + dt * out.frac));
    return events;
  }

  private open(t: number, startedHere: boolean): PitEvent[] {
    this.visit = {
      n: ++this.count,
      inT: t,
      outT: t,
      laneMs: 0,
      stationaryMs: 0,
      stopsAt: [],
      maxSpeed: 0,
      overLimitMs: 0,
      limit: this.limit,
      fromStart: startedHere || undefined,
      stillSince: null,
      stopping: [],
    };
    return [{ type: 'pitIn', t }];
  }

  private stop(from: number): PitEvent[] {
    const v = this.visit!;
    // Braking for it began where speed last started falling, within 15 s.
    let brakeT: number | null = null;
    for (let i = this.speeds.length - 1; i > 0; i--) {
      const s = this.speeds[i];
      if (s.t > from) continue;
      if (from - s.t > 15_000) break;
      if (this.speeds[i - 1].v <= s.v + 0.2) {
        brakeT = s.t;
        break;
      }
    }
    v.stopping.push({ from, to: null, brakeT });
    return [{ type: 'stopped', t: from }];
  }

  private launch(t: number): PitEvent[] {
    const v = this.visit!;
    const s = v.stopping[v.stopping.length - 1];
    if (!s || s.to !== null) return [];
    s.to = Math.max(t, s.from);
    v.stationaryMs += s.to - s.from;
    v.stillSince = null;
    return [{ type: 'moving', t: s.to }];
  }

  private close(t: number): PitEvent {
    const v = this.visit!;
    const open = v.stopping[v.stopping.length - 1];
    if (open && open.to === null) this.launch(t);
    const { stillSince: _s, stopping, ...stop } = v;
    const done: PitStop = {
      ...stop,
      outT: t,
      laneMs: Math.round(t - v.inT),
      stationaryMs: Math.round(v.stationaryMs),
      overLimitMs: Math.round(v.overLimitMs),
      stopsAt: stopping.map((s) => ({ from: Math.round(s.from), to: Math.round(s.to ?? t), brakeT: s.brakeT === null ? undefined : Math.round(s.brakeT) })),
    };
    this.stops.push(done);
    this.visit = null;
    return { type: 'pitOut', stop: done };
  }

  /** The session ended in the pits: close the visit there. */
  finish(t: number): PitStop | null {
    if (!this.visit) return null;
    const e = this.close(t) as { type: 'pitOut'; stop: PitStop };
    e.stop.unfinished = true;
    return e.stop;
  }
}
