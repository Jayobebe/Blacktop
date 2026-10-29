/**
 * Convoy route sharing: one routing request for the convoy, not one a phone. Every phone in a
 * convoy goes the same way (the same waypoints and destination), so a phone that gets a route
 * from the server shares it over the convoy's live channel (`route-request-<convoy id>`, event
 * `route`; `RouteRequestHost` wires it up), and a convoy mate about to ask for the same plan
 * (the same stops after their own position, the same vehicle and avoid preferences) who is
 * within `JOIN_M` of that route takes it from where they are instead (`sliceRouteFrom`).
 * Nothing is stored anywhere: the routes live in memory while in the convoy, and a rider's
 * position on the line is something the convoy already sees. A rider off it asks the server as
 * always, and rerouting works as before (off the line means no match). Before this, eight riders
 * made eight requests and eight sets of reroutes. A convoy sets off (or gets a new waypoint) all at
 * once, so a member meeting a plan for the first time waits up to `WAIT_MS` for the leader's route
 * (`waitForSharedRoute`); the leader always asks straight away.
 *
 * Imports only types, so it costs the map nothing.
 */
import type { RouteLeg, RouteResult, RouteStep } from './routing';

/** A rider this close to a shared route (and not near its end) is on it. */
export const JOIN_M = 30;
/** A shared route older than this is left alone (the convoy will have moved on). */
const KEEP_MS = 30 * 60_000;
/** One share a phone in this long: reroutes come in bursts. */
const SHARE_GAP_MS = 15_000;
/** Larger than this (encoded) isn't sent: the live channel's message limit. */
const MAX_BYTES = 200_000;

/** How long a member waits for the leader's route to a plan it hasn't seen yet. */
export const WAIT_MS = 3000;

type Stop = { lat: number; lng: number };
type Shared = { plan: string; prefs: string; route: RouteResult; at: number };

let shared: Shared[] = [];
let publish: ((payload: unknown) => void) | null = null;
let lastShareAt = 0;
let leading = false;
/** Plans this phone has seen a route for (a member's reroute on a known plan doesn't wait). */
const seenPlans = new Set<string>();
const arrivals = new Set<() => void>();

/** The plan as everyone in the convoy has it: the stops after the rider's own position. */
export function planKey(stops: Stop[]): string {
  return stops.slice(1).map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join(';');
}

// ── Cutting a route to start where a rider is ─────────────────────────────

const metres = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * 111_320;
  const dLng = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

/** The nearest point on the line to `p`: segment index, the point, how far off and how far along. */
function nearestOnLine(line: [number, number][], p: [number, number]) {
  let best = { i: -1, point: line[0], off: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
    const ky = 111_320;
    const ax = 0, ay = 0;
    const bx = (b[0] - a[0]) * kx, by = (b[1] - a[1]) * ky;
    const px = (p[0] - a[0]) * kx, py = (p[1] - a[1]) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2)) : 0;
    const off = Math.hypot(px - bx * t, py - by * t);
    const seg = Math.sqrt(len2);
    if (off < best.off) best = { i, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], off, along: walked + seg * t };
    walked += seg;
  }
  return { ...best, total: walked };
}

/**
 * The route from where the rider is, or null when they aren't on it (more than `joinM` off, or
 * past its first leg: the stops after them must be the same ones). The line starts at their
 * spot on it, the first leg's manoeuvres already behind them are dropped (a "depart" there
 * instead), and the distance and times are what's left.
 */
export function sliceRouteFrom(route: RouteResult, at: Stop, joinM = JOIN_M): RouteResult | null {
  const line = route.geometry.coordinates;
  if (line.length < 2) return null;
  const near = nearestOnLine(line, [at.lng, at.lat]);
  if (near.i < 0 || near.off > joinM) return null;
  const firstLeg = route.legs?.[0]?.distance ?? route.distanceMeters;
  // Near the end of the first leg (or the route): too little left to be worth sharing.
  if (near.along > firstLeg - 200 || near.total - near.along < 200) return null;
  const left = Math.max(0, route.distanceMeters - near.along);
  const share = route.distanceMeters > 0 ? left / route.distanceMeters : 1;
  const coordinates: [number, number][] = [near.point, ...line.slice(near.i + 1)];
  let legs: RouteLeg[] | undefined;
  if (route.legs?.length) {
    const [first, ...rest] = route.legs;
    // Where each manoeuvre is along the first leg: the sum of the steps before it.
    let walked = 0;
    const placed = first.steps.map((s) => {
      const from = walked;
      walked += s.distance;
      return { s, from };
    });
    const ahead = placed.filter((p) => p.from > near.along + 5);
    const firstShare = first.distance > 0 ? Math.max(0, first.distance - near.along) / first.distance : 1;
    const nextFrom = ahead[0]?.from ?? first.distance;
    const current = [...placed].reverse().find((p) => p.from <= near.along + 5)?.s;
    const depart: RouteStep = {
      type: 'depart',
      modifier: null,
      exit: null,
      location: near.point,
      name: current?.name ?? '',
      ref: current?.ref ?? '',
      rotary: '',
      side: current?.side,
      distance: Math.max(0, nextFrom - near.along),
      duration: current && current.distance > 0 ? (current.duration * Math.max(0, nextFrom - near.along)) / current.distance : 0,
    };
    legs = [
      { distance: Math.max(0, first.distance - near.along), duration: first.duration * firstShare, steps: [depart, ...ahead.map((p) => p.s)] },
      ...rest,
    ];
  }
  return {
    geometry: { type: 'LineString', coordinates },
    distanceMeters: left,
    durationSeconds: route.durationSeconds * share,
    ...(legs ? { legs } : {}),
    ...(route.durationRangeSeconds ? { durationRangeSeconds: [route.durationRangeSeconds[0] * share, route.durationRangeSeconds[1] * share] as [number, number] } : {}),
  };
}

// ── The convoy's shared routes ───────────────────────────────────────────

/** A convoy mate's route for these stops, cut to start where this rider is; null to ask the server. */
export function findSharedRoute(stops: Stop[], prefs: string): RouteResult | null {
  if (!publish || stops.length < 2) return null;
  const plan = planKey(stops);
  const now = Date.now();
  shared = shared.filter((s) => now - s.at < KEEP_MS);
  for (const s of [...shared].reverse()) {
    if (s.plan !== plan || s.prefs !== prefs) continue;
    const cut = sliceRouteFrom(s.route, stops[0]);
    if (cut) return cut;
  }
  return null;
}

/** A route this phone got from the server: shared with the convoy (when in one). */
export function shareRoute(stops: Stop[], prefs: string, route: RouteResult) {
  if (!publish || stops.length < 2 || !route.legs?.length) return;
  if (Date.now() - lastShareAt < SHARE_GAP_MS) return;
  const payload = { v: 1, plan: planKey(stops), prefs, line: encodeLine(route.geometry.coordinates), distance: route.distanceMeters, duration: route.durationSeconds, legs: route.legs, range: route.durationRangeSeconds ?? null };
  if (JSON.stringify(payload).length > MAX_BYTES) return;
  lastShareAt = Date.now();
  seenPlans.add(payload.plan);
  // Its own route is shared too, for the next time this phone asks (a reroute back onto it).
  shared = [...shared.slice(-5), { plan: payload.plan, prefs, route, at: Date.now() }];
  publish(payload);
}

/** A convoy mate's shared route, checked before it's kept. */
export function receiveSharedRoute(raw: unknown) {
  const p = raw as { v?: number; plan?: unknown; prefs?: unknown; line?: unknown; distance?: unknown; duration?: unknown; legs?: unknown; range?: unknown } | null;
  if (!p || p.v !== 1 || typeof p.plan !== 'string' || typeof p.prefs !== 'string' || typeof p.line !== 'string') return;
  if (p.plan.length > 2000 || p.prefs.length > 300 || p.line.length > MAX_BYTES) return;
  if (typeof p.distance !== 'number' || typeof p.duration !== 'number' || !Number.isFinite(p.distance) || !Number.isFinite(p.duration)) return;
  const coordinates = decodeLine(p.line);
  if (!coordinates || coordinates.length < 2 || coordinates.length > 50_000) return;
  const legs = cleanLegs(p.legs);
  if (!legs) return;
  const range = Array.isArray(p.range) && p.range.length === 2 && p.range.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (p.range as [number, number]) : undefined;
  const route: RouteResult = { geometry: { type: 'LineString', coordinates }, distanceMeters: p.distance, durationSeconds: p.duration, legs, ...(range ? { durationRangeSeconds: range } : {}) };
  shared = [...shared.filter((s) => Date.now() - s.at < KEEP_MS).slice(-5), { plan: p.plan, prefs: p.prefs, route, at: Date.now() }];
  seenPlans.add(p.plan);
  arrivals.forEach((f) => f());
}

/**
 * In a convoy, a member asking for a plan it hasn't had a route for yet (the convoy setting off,
 * or a new waypoint) waits up to `ms` for the leader's, which every phone is asking for at that
 * same moment. Null straight away for the leader, outside a convoy, or for a plan already seen
 * (a reroute: the shared route didn't fit, so the server it is).
 */
export function waitForSharedRoute(stops: Stop[], prefs: string, ms = WAIT_MS): Promise<RouteResult | null> {
  const plan = planKey(stops);
  if (!publish || leading || stops.length < 2 || seenPlans.has(plan)) return Promise.resolve(null);
  seenPlans.add(plan);
  return new Promise((resolve) => {
    const done = (r: RouteResult | null) => {
      clearTimeout(timer);
      arrivals.delete(check);
      resolve(r);
    };
    const check = () => {
      const r = findSharedRoute(stops, prefs);
      if (r) done(r);
    };
    const timer = setTimeout(() => done(null), ms);
    arrivals.add(check);
  });
}

function cleanLegs(raw: unknown): RouteLeg[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 30) return null;
  const legs: RouteLeg[] = [];
  for (const l of raw) {
    const leg = l as Partial<RouteLeg> | null;
    if (!leg || typeof leg.distance !== 'number' || typeof leg.duration !== 'number' || !Array.isArray(leg.steps) || leg.steps.length > 2000) return null;
    const steps: RouteStep[] = [];
    for (const r of leg.steps) {
      const s = r as Partial<RouteStep> | null;
      if (!s || typeof s.distance !== 'number' || typeof s.duration !== 'number') return null;
      const loc = Array.isArray(s.location) && s.location.length === 2 && s.location.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (s.location as [number, number]) : null;
      const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
      steps.push({
        type: text(s.type, 30) || 'turn',
        modifier: typeof s.modifier === 'string' ? s.modifier.slice(0, 30) : null,
        exit: typeof s.exit === 'number' && Number.isFinite(s.exit) ? s.exit : null,
        location: loc,
        name: text(s.name, 120),
        ref: text(s.ref, 60),
        destinations: text(s.destinations, 160),
        rotary: text(s.rotary, 80),
        side: s.side === 'left' ? 'left' : 'right',
        distance: s.distance,
        duration: s.duration,
      });
    }
    legs.push({ distance: leg.distance, duration: leg.duration, steps });
  }
  return legs;
}

/** Wired by RouteRequestHost while in a convoy (null when out of one: nothing shared or kept). */
export function setRoutePublisher(fn: ((payload: unknown) => void) | null) {
  publish = fn;
  if (!fn) {
    shared = [];
    seenPlans.clear();
  }
}

/** Whether this phone leads the convoy (it never waits for anyone's route). */
export function setRouteLeading(on: boolean) {
  leading = on;
}

// ── The line, compactly (Google's polyline encoding, 1e-5 degrees) ────────

export function encodeLine(coords: [number, number][]): string {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    put(la - pLat);
    put(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

export function decodeLine(s: string): [number, number][] | null {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const take = (): number | null => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      if (i >= s.length) return null;
      b = s.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    const dLat = take();
    const dLng = take();
    if (dLat === null || dLng === null) return null;
    lat += dLat;
    lng += dLng;
    if (Math.abs(lat) > 9_000_000 || Math.abs(lng) > 18_000_000) return null;
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}
