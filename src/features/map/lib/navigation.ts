// Turn-by-turn guidance maths: places the route's manoeuvres along the line,
// matches the rider's GPS fix to the route, and writes the instructions that
// are shown in the turn banner and spoken aloud. Pure functions, no React.
import type { RouteResult, RouteStep } from './routing';

import { tr } from '@/lib/i18n';
type LngLat = [number, number];

export interface NavManeuver extends RouteStep {
  /** Metres from the start of the route to this manoeuvre. */
  along: number;
  /** Which leg (stop-to-stop hop) it belongs to. */
  leg: number;
  /** Position in the route's full manoeuvre list. */
  index: number;
  /** True for manoeuvres that aren't worth showing or saying (road renamed, straight on). */
  silent: boolean;
}

export interface NavRoute {
  coords: LngLat[];
  /** Metres from the start to each vertex. */
  cum: number[];
  length: number;
  maneuvers: NavManeuver[];
  /** Metres from the start to the end of each leg (the last one is the destination). */
  legEnds: number[];
}

export interface NavProgress {
  /** Metres travelled along the route. */
  along: number;
  /** How far the rider is from the route line, in metres. */
  offset: number;
  next: NavManeuver | null;
  distanceToNext: number;
  /** A manoeuvre that follows `next` closely enough to mention together. */
  then: NavManeuver | null;
  remainingMeters: number;
  remainingSeconds: number;
}

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function metersBetweenLngLat(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest point on segment i to p: distance (m) and fraction along the segment. */
function projectOnSegment(coords: LngLat[], i: number, p: LngLat): { dist: number; t: number } {
  const a = coords[i];
  const b = coords[i + 1];
  const kx = Math.cos(toRad(p[1])) * (Math.PI / 180) * EARTH_R;
  const ky = (Math.PI / 180) * EARTH_R;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { dist: Math.sqrt(x * x + y * y), t };
}

function isSilent(step: RouteStep): boolean {
  if (step.type === 'depart') return true;
  const straightish = !step.modifier || step.modifier === 'straight' || step.modifier.startsWith('slight');
  if (step.type === 'notification' || step.type === 'exit roundabout' || step.type === 'exit rotary') return true;
  if (step.type === 'new name' && straightish) return true;
  if (step.type === 'continue' && (!step.modifier || step.modifier === 'straight')) return true;
  return false;
}

/**
 * Prepares a route for guidance. Works without manoeuvres too (an older
 * server, or a route fetched without steps): off-route detection still runs,
 * there's just nothing to announce.
 */
export function buildNavRoute(route: RouteResult, viaLegs: boolean[] = []): NavRoute | null {
  const coords = route.geometry?.coordinates as LngLat[] | undefined;
  if (!coords || coords.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metersBetweenLngLat(coords[i - 1], coords[i]));
  const length = cum[cum.length - 1];

  const maneuvers: NavManeuver[] = [];
  const legEnds: number[] = [];
  let seg = 0;
  (route.legs ?? []).forEach((leg, legIndex) => {
    leg.steps.forEach((step) => {
      let along = maneuvers.length ? maneuvers[maneuvers.length - 1].along : 0;
      if (step.location) {
        // Manoeuvres sit on the line in order, so search forward from the last
        // one: the first segment that passes within a few metres is it. This
        // keeps loops and out-and-back roads from matching the wrong pass.
        let best = { dist: Infinity, i: seg, t: 0 };
        for (let i = seg; i < coords.length - 1; i++) {
          const pr = projectOnSegment(coords, i, step.location);
          if (pr.dist < best.dist) best = { dist: pr.dist, i, t: pr.t };
          if (pr.dist < 3) break;
        }
        seg = best.i;
        along = cum[best.i] + (cum[best.i + 1] - cum[best.i]) * best.t;
      }
      // Arriving at a via point (twisty leg, loop point, weather detour) isn't
      // worth announcing; only real stops and the destination are.
      const silent = isSilent(step) || (step.type === 'arrive' && !!viaLegs[legIndex]);
      maneuvers.push({ ...step, along, leg: legIndex, index: maneuvers.length, silent });
    });
    legEnds.push(maneuvers.length ? maneuvers[maneuvers.length - 1].along : length);
  });
  if (legEnds.length) legEnds[legEnds.length - 1] = length;
  else legEnds.push(length);

  return { coords, cum, length, maneuvers, legEnds };
}

/**
 * Matches a GPS fix to the route. Looks near the last known position first so
 * a road the route uses twice (loops, out-and-backs) doesn't jump ahead, and
 * falls back to the whole route when the rider isn't near that stretch.
 */
export function snapToRoute(nav: NavRoute, p: { lat: number; lng: number }, hintAlong: number | null) {
  const pt: LngLat = [p.lng, p.lat];
  const { coords, cum } = nav;
  const search = (from: number, to: number) => {
    let best = { dist: Infinity, along: 0 };
    for (let i = 0; i < coords.length - 1; i++) {
      if (cum[i + 1] < from || cum[i] > to) continue;
      const pr = projectOnSegment(coords, i, pt);
      if (pr.dist < best.dist) best = { dist: pr.dist, along: cum[i] + (cum[i + 1] - cum[i]) * pr.t };
    }
    return best;
  };
  // No hint yet: the route was just planned from here, so look near the start
  // first (a loop's finish sits on its start and mustn't win).
  const h = hintAlong ?? 0;
  let best = search(h - 150, h + 2500);
  if (best.dist > 40) {
    const all = search(-Infinity, Infinity);
    if (all.dist < best.dist - 20) best = all;
  }
  return { along: best.along, offset: best.dist };
}

export function navProgress(nav: NavRoute, along: number, offset: number): NavProgress {
  const ms = nav.maneuvers;
  // The manoeuvre we're currently travelling from (for time left on this step).
  let prevIdx = -1;
  for (let i = 0; i < ms.length; i++) {
    if (ms[i].along <= along + 5) prevIdx = i;
    else break;
  }
  let next: NavManeuver | null = null;
  for (let i = prevIdx + 1; i < ms.length; i++) {
    if (!ms[i].silent) {
      next = ms[i];
      break;
    }
  }
  let then: NavManeuver | null = null;
  if (next) {
    for (let i = next.index + 1; i < ms.length; i++) {
      if (ms[i].silent) continue;
      if (ms[i].along - next.along < 150 && ms[i].leg === next.leg) then = ms[i];
      break;
    }
  }

  const remainingMeters = Math.max(0, nav.length - along);
  let remainingSeconds: number;
  if (ms.length && prevIdx >= 0) {
    const prev = ms[prevIdx];
    const nextAny = ms[prevIdx + 1];
    const stepLen = nextAny ? nextAny.along - prev.along : nav.length - prev.along;
    const leftOnStep = stepLen > 0 ? Math.max(0, Math.min(1, (prev.along + stepLen - along) / stepLen)) : 0;
    remainingSeconds = prev.duration * leftOnStep;
    for (let i = prevIdx + 1; i < ms.length; i++) remainingSeconds += ms[i].duration;
  } else {
    // No manoeuvres: assume a steady 50 km/h for what's left.
    remainingSeconds = remainingMeters / 13.9;
  }

  return {
    along,
    offset,
    next,
    distanceToNext: next ? Math.max(0, next.along - along) : remainingMeters,
    then,
    remainingMeters,
    remainingSeconds,
  };
}

/** The line still ahead of the rider, for drawing. */
export function remainingLine(nav: NavRoute, along: number): LngLat[] {
  const { coords, cum } = nav;
  if (along <= 0) return coords;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] <= along) i++;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen > 0 ? Math.min(1, (along - cum[i]) / segLen) : 0;
  const a = coords[i];
  const b = coords[i + 1];
  const start: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [start, ...coords.slice(i + 1)];
}

// ── Wording ─────────────────────────────────────────────────────────────────

// Whole phrases per case (not English fragments glued together) so every
// language can word them its own way.
const ORDINALS = [tr("first"), tr("second"), tr("third"), tr("fourth"), tr("fifth"), tr("sixth"), tr("seventh"), tr("eighth"), tr("ninth"), tr("tenth")];

function roadOf(m: RouteStep): string {
  if (m.name && m.ref) return `${m.name} (${m.ref})`;
  return m.name || m.ref || '';
}

/** Spoken road: names read better than refs, and refs like "A40;A44" need tidying. */
function spokenRoadOf(m: RouteStep): string {
  return m.name || (m.ref ? m.ref.split(';')[0] : '');
}

/** Mid-sentence: "At the roundabout, turn left". */
function direction(modifier: string | null): string {
  switch (modifier) {
    case 'uturn':
      return tr("make a U-turn");
    case 'sharp left':
      return tr("turn sharp left");
    case 'sharp right':
      return tr("turn sharp right");
    case 'slight left':
      return tr("bear left");
    case 'slight right':
      return tr("bear right");
    case 'left':
      return tr("turn left");
    case 'right':
      return tr("turn right");
    default:
      return tr("go straight on");
  }
}

/** Start of a sentence: "Turn left". */
function Direction(modifier: string | null): string {
  switch (modifier) {
    case 'uturn':
      return tr("Make a U-turn");
    case 'sharp left':
      return tr("Turn sharp left");
    case 'sharp right':
      return tr("Turn sharp right");
    case 'slight left':
      return tr("Bear left");
    case 'slight right':
      return tr("Bear right");
    case 'left':
      return tr("Turn left");
    case 'right':
      return tr("Turn right");
    default:
      return tr("Go straight on");
  }
}

function side(modifier: string | null): 'left' | 'right' | null {
  if (!modifier) return null;
  if (modifier.includes('left')) return 'left';
  if (modifier.includes('right')) return 'right';
  return null;
}

/**
 * The instruction for a manoeuvre. `stopName` names the stop an "arrive"
 * manoeuvre ends at; `finalStop` says whether it's the destination.
 */
export function maneuverText(
  m: NavManeuver,
  opts: { spoken?: boolean; stopName?: string | null; finalStop?: boolean } = {},
): string {
  // Spoken prompts leave road names out: the turn banner shows them.
  const road = opts.spoken ? '' : roadOf(m);
  if (opts.spoken && m.destinations) m = { ...m, destinations: undefined };
  const onto = road ? tr(" onto {0}", [road]) : '';
  const towards = m.destinations ? tr(" towards {0}", [m.destinations.split(',')[0]]) : '';
  const s = side(m.modifier);
  const bySide = (left: string, right: string, none: string) => (s === 'left' ? left : s === 'right' ? right : none);

  switch (m.type) {
    case 'depart':
      return road ? tr("Head off on {0}", [road]) : tr("Head off along the route");
    case 'arrive': {
      const where = opts.stopName ? opts.stopName : opts.finalStop ? tr("your destination") : tr("your next stop");
      return bySide(tr("Arrive at {0}, on the left", [where]), tr("Arrive at {0}, on the right", [where]), tr("Arrive at {0}", [where]));
    }
    case 'roundabout':
    case 'rotary': {
      const what = m.type === 'rotary' && m.rotary ? m.rotary : tr("the roundabout");
      if (m.exit && m.exit >= 1 && m.exit <= ORDINALS.length) return tr("At {0}, take the {1} exit", [what, ORDINALS[m.exit - 1]]) + onto;
      return tr("At {0}, {1}", [what, direction(m.modifier)]) + onto;
    }
    case 'roundabout turn':
      return tr("At the roundabout, {0}", [direction(m.modifier)]) + onto;
    case 'exit roundabout':
    case 'exit rotary':
      return tr("Exit the roundabout") + onto;
    case 'end of road':
      return tr("At the end of the road, {0}", [direction(m.modifier)]) + onto;
    case 'fork':
      return bySide(tr("Keep left at the fork"), tr("Keep right at the fork"), tr("Keep straight at the fork")) + (onto || towards);
    case 'merge':
      return bySide(tr("Merge left"), tr("Merge right"), tr("Merge")) + onto;
    case 'on ramp':
      return bySide(tr("Take the ramp on the left"), tr("Take the ramp on the right"), tr("Take the ramp")) + (onto || towards);
    case 'off ramp':
      return bySide(tr("Take the exit on the left"), tr("Take the exit on the right"), tr("Take the exit")) + (towards || onto);
    case 'continue':
      if (m.modifier === 'uturn') return tr("Make a U-turn") + onto;
      if (s) return bySide(tr("Keep left"), tr("Keep right"), '') + onto;
      return road ? tr("Continue on {0}", [road]) : tr("Continue");
    case 'new name':
      return tr("Continue") + onto;
    default:
      if (m.modifier === 'straight') return road ? tr("Go straight on along {0}", [road]) : tr("Go straight on");
      return Direction(m.modifier) + onto;
  }
}

export type DistanceUnit = 'miles' | 'km';

/** Short distance for the banner: "500 ft", "0.3 mi", "200 m", "1.2 km". */
export function shortDistance(meters: number, unit: DistanceUnit): { value: string; unit: string } {
  if (unit === 'miles') {
    const feet = meters * 3.28084;
    if (feet < 1000) return { value: String(Math.max(50, Math.round(feet / 50) * 50)), unit: 'ft' };
    const mi = meters / 1609.34;
    return { value: mi < 10 ? mi.toFixed(1) : String(Math.round(mi)), unit: 'mi' };
  }
  if (meters < 1000) return { value: String(Math.max(10, Math.round(meters / (meters < 300 ? 10 : 50)) * (meters < 300 ? 10 : 50))), unit: 'm' };
  const km = meters / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: 'km' };
}

/** Distance as it's read out: "500 feet", "a quarter of a mile", "2 kilometres". */
export function spokenDistance(meters: number, unit: DistanceUnit): string {
  if (unit === 'miles') {
    const feet = meters * 3.28084;
    if (feet < 1000) return tr("{0} feet", [Math.max(100, Math.round(feet / 100) * 100)]);
    const mi = meters / 1609.34;
    if (mi < 0.35) return tr("a quarter of a mile");
    if (mi < 0.65) return tr("half a mile");
    if (mi < 0.9) return tr("three quarters of a mile");
    if (mi < 1.25) return tr("1 mile");
    const r = mi < 10 ? Math.round(mi * 2) / 2 : Math.round(mi);
    return tr("{0} miles", [r]);
  }
  if (meters < 1000) return tr("{0} metres", [Math.max(50, Math.round(meters / 50) * 50)]);
  const km = meters / 1000;
  if (km < 1.25) return tr("1 kilometre");
  const r = km < 10 ? Math.round(km * 2) / 2 : Math.round(km);
  return tr("{0} kilometres", [r]);
}

/** Lower-cases the first letter so an instruction can follow "In 500 feet, ". */
export function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}
