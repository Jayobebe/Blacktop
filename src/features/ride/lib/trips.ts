/**
 * Trips: a planned route with stops, ridden in legs (each stretch from one
 * point to the next), over one ride or several. History groups a trip's rides
 * into one card with a combined receipt and each leg's own (pages/TripDetail).
 *
 * - A trip starts with a ride that sets off on a plan with at least one stop on
 *   the way: a saved route (map/lib/savedRoutes) ridden from Blacktop Command or
 *   picked in the map's search, a solo route with stops, or a convoy's
 *   waypoints (each rider's phone keeps its own copy of the trip).
 * - A leg is done when the rider gets within ARRIVE_M of its end point, whatever
 *   the map is doing (the ride's own GPS, `trackTripFix`). Riding on past a stop
 *   carries on into the next leg in the same ride.
 * - Ending a ride hands its legs to the saved ride (`takeTripLeg`, in endRide):
 *   the ride is a leg receipt (or part of one, if it ended short of the stop),
 *   and the trip remembers it.
 * - Riding the same saved route again picks the trip up where it was left: the
 *   route is set from the next unfinished point on (`routeForTrip`).
 *
 * Kept on the phone: `blacktop_trips` (carried by backups, like the rides),
 * and the trip a ride in progress belongs to (`blacktop_trip_active`, left out:
 * it belongs to the moment).
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';
import { DEMO_TRIPS, isDemoModeActive, useDemoMode } from '@/lib/demoMode';

export interface TripPoint {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  /** Bends that shape the way here from the point before (a twisty pick): ridden through, never a leg. */
  shape?: { lat: number; lng: number }[];
}

/** One ride of a trip: the legs it finished (`from` up to, not including, `to`; equal when it ended short). */
export interface TripRideLink {
  rideId: string;
  from: number;
  to: number;
  at: string;
}

export interface Trip {
  id: string;
  name: string;
  /** The saved route it rides, so riding that route again carries on. */
  routeId?: string;
  /** Start, the stops on the way, the end: legs run from each to the next. */
  points: TripPoint[];
  /** Legs finished. */
  legsDone: number;
  rides: TripRideLink[];
  convoy?: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/** What a saved ride carries about its trip (types/blacktop RideSession.trip). */
export interface RideTripLeg {
  tripId: string;
  name: string;
  /** Legs finished on this ride, as 0-based indexes: from up to (not including) to. */
  from: number;
  to: number;
  total: number;
}

const KEY = 'blacktop_trips';
const ACTIVE_KEY = 'blacktop_trip_active';
const MAX = 40;
/** Close enough to a stop to count it reached. */
const ARRIVE_M = 120;
/** A trip asked for (a saved route picked) waits this long for a ride to start. */
const PENDING_MS = 2 * 60 * 60 * 1000;

export const legCount = (t: Trip) => Math.max(0, t.points.length - 1);
export const tripFinished = (t: Trip) => t.legsDone >= legCount(t);

function read(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Trip[]) : [];
    return Array.isArray(list) ? list.filter((t) => t && Array.isArray(t.points)) : [];
  } catch {
    return [];
  }
}

let trips: Trip[] = typeof window !== 'undefined' ? read() : [];
const listeners = new Set<() => void>();
function commit(next: Trip[]) {
  trips = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trips));
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}
function patch(id: string, fn: (t: Trip) => Trip) {
  commit(trips.map((t) => (t.id === id ? { ...fn(t), updatedAt: new Date().toISOString() } : t)));
}

/** The trips (demo mode: the demo's). */
const all = () => (isDemoModeActive() ? DEMO_TRIPS : trips);
export const getTrip = (id: string) => all().find((t) => t.id === id) ?? null;

export function useTrips(): Trip[] {
  const demo = useDemoMode().enabled;
  const real = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => trips,
    () => trips,
  );
  return demo ? DEMO_TRIPS : real;
}

/** The latest unfinished trip on a saved route, to carry on. */
export function openTripForRoute(routeId: string): Trip | null {
  return all().find((t) => t.routeId === routeId && !tripFinished(t)) ?? null;
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ── Picking a trip before the ride starts ─────────────────────────────────────

let pending: { tripId?: string; routeId?: string; name?: string; points?: TripPoint[]; at: number } | null = null;

/**
 * The route a trip rides from where it's got to: the next unfinished point on
 * as the stops, its end as the destination. For a new trip on a saved route,
 * the whole route (its start a stop).
 */
export function routeForTrip(points: TripPoint[], legsDone: number): { destination: TripPoint; stops: TripPoint[] } {
  const rest = points.slice(Math.min(points.length - 1, legsDone + 1));
  return { destination: rest[rest.length - 1], stops: withShape(rest).slice(0, -1) };
}

/** Points as the stops to route through: each one's bends ("Twisty leg") before it. */
function withShape(points: TripPoint[]): TripPoint[] {
  return points.flatMap((p) => [...(p.shape ?? []).map((v) => ({ lat: v.lat, lng: v.lng, name: tr("Twisty leg") })), p]);
}

/**
 * A saved route picked to ride: carries on its unfinished trip, or starts a new
 * one with the next ride (a route with stops on the way; a straight A to B is
 * one leg and no trip). Returns the route to set.
 */
export function chooseRouteTrip(route: { id: string; name: string; from: TripPoint; via?: TripPoint[]; to: TripPoint }): { destination: TripPoint; stops: TripPoint[]; trip: Trip | null } {
  const open = openTripForRoute(route.id);
  if (open) {
    pending = { tripId: open.id, at: Date.now() };
    return { ...routeForTrip(open.points, open.legsDone), trip: open };
  }
  const points = [route.from, ...(route.via ?? []), route.to];
  if ((route.via ?? []).length) pending = { routeId: route.id, name: route.name, points, at: Date.now() };
  return { destination: route.to, stops: withShape([route.from, ...(route.via ?? []), route.to]).slice(0, -1), trip: null };
}

/** Carry on a trip from History: the route from where it's got to, and the next ride joins it. */
export function chooseTrip(tripId: string): { destination: TripPoint; stops: TripPoint[] } | null {
  const t = getTrip(tripId);
  if (!t || tripFinished(t)) return null;
  pending = { tripId: t.id, at: Date.now() };
  return routeForTrip(t.points, t.legsDone);
}

// ── The ride in progress ──────────────────────────────────────────────────────

interface Active {
  tripId: string;
  /** Legs already finished when this ride set off. */
  startLegs: number;
  /** The ride it belongs to (its start time), so a reload carries on with the same one. */
  rideStartedAt: string;
}
function readActive(): Active | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as Active) : null;
  } catch {
    return null;
  }
}
let active: Active | null = typeof window !== 'undefined' ? readActive() : null;
function setActive(a: Active | null) {
  active = a;
  try {
    if (a) localStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* fine */
  }
}

/**
 * A ride has set off (ActiveRide, once per ride): it joins the trip picked for
 * it, or starts one from the plan it's riding (stops on the way), or is no trip.
 * `start` is where it set off, when known (else the first fix fills it in).
 */
export function armTripForRide(rideStartedAt: string, plan: { name: string; points: TripPoint[]; convoy?: boolean } | null, start: { lat: number; lng: number } | null) {
  if (active?.rideStartedAt === rideStartedAt) return; // already (a reload mid-ride)
  const p = pending && Date.now() - pending.at < PENDING_MS ? pending : null;
  pending = null;
  if (p?.tripId) {
    const t = getTrip(p.tripId);
    if (t && !tripFinished(t)) {
      setActive({ tripId: t.id, startLegs: t.legsDone, rideStartedAt });
      return;
    }
  }
  const points = p?.points ?? plan?.points ?? null;
  if (!points || points.length < 3) {
    setActive(null);
    return; // one leg or none: a ride, not a trip
  }
  const now = new Date().toISOString();
  const first = points[0];
  const startPoint = p?.points ? first : start ? { lat: start.lat, lng: start.lng, name: tr("Start") } : { ...first, lat: NaN };
  const trip: Trip = {
    id: crypto.randomUUID(),
    name: p?.name ?? plan!.name,
    routeId: p?.routeId,
    points: [startPoint, ...points.slice(1)],
    legsDone: 0,
    rides: [],
    convoy: plan?.convoy,
    createdAt: now,
    updatedAt: now,
  };
  commit([trip, ...trips]);
  setActive({ tripId: trip.id, startLegs: 0, rideStartedAt });
}

/** The trip the ride in progress belongs to, and the leg it's on. */
export function activeTrip(): { trip: Trip; leg: number; total: number } | null {
  if (!active) return null;
  const t = getTrip(active.tripId);
  return t ? { trip: t, leg: Math.min(t.legsDone + 1, legCount(t)), total: legCount(t) } : null;
}

/**
 * A fix from the ride: a leg done when it reaches that leg's end. Returns what
 * happened, for the ride screen to say ("Leg 2 of 4 done", "Trip finished").
 */
export function trackTripFix(lat: number, lng: number, accuracy?: number | null): { leg: number; total: number; finished: boolean; name: string } | null {
  if (!active || (accuracy != null && accuracy > 60)) return null;
  const t = getTrip(active.tripId);
  if (!t || tripFinished(t)) return null;
  // A trip started before the first fix: its start is where the ride set off.
  if (Number.isNaN(t.points[0].lat)) {
    patch(t.id, (x) => ({ ...x, points: [{ lat, lng, name: tr("Start") }, ...x.points.slice(1)] }));
    return null;
  }
  const next = t.points[t.legsDone + 1];
  if (!next || haversineM({ lat, lng }, next) > ARRIVE_M) return null;
  const legsDone = t.legsDone + 1;
  const total = legCount(t);
  const finished = legsDone >= total;
  patch(t.id, (x) => ({ ...x, legsDone, finishedAt: finished ? new Date().toISOString() : x.finishedAt }));
  return { leg: legsDone, total, finished, name: next.name };
}

/**
 * The ride is over: what it was of its trip (for the saved ride), with the ride
 * linked into the trip when it was saved (`rideId`, null when it wasn't). Ends
 * the trip's hold on the ride either way.
 */
let lastTaken: RideTripLeg | undefined;
/** The legs the ride that just ended was of its trip (the ride screen's receipt prints them). */
export const lastTripLeg = () => lastTaken;

export function takeTripLeg(rideId: string | null): RideTripLeg | undefined {
  const a = active;
  setActive(null);
  lastTaken = undefined;
  if (!a) return undefined;
  const t = getTrip(a.tripId);
  if (!t) return undefined;
  const leg: RideTripLeg = { tripId: t.id, name: t.name, from: a.startLegs, to: t.legsDone, total: legCount(t) };
  lastTaken = leg;
  if (rideId) patch(t.id, (x) => ({ ...x, rides: [...x.rides, { rideId, from: a.startLegs, to: x.legsDone, at: new Date().toISOString() }] }));
  return leg;
}

/** Forget a trip (its rides stay in History as ordinary rides). */
export function forgetTrip(id: string) {
  commit(trips.filter((t) => t.id !== id));
}

/** Rides deleted from History come out of their trips; a trip left with none goes too. */
export function dropTripRides(rideIds: string[]) {
  if (!rideIds.length) return;
  const gone = new Set(rideIds);
  commit(
    trips
      .map((t) => ({ ...t, rides: t.rides.filter((r) => !gone.has(r.rideId)) }))
      .filter((t) => t.rides.length > 0 || t.legsDone === 0 && t.rides.length === 0 && Date.now() - Date.parse(t.createdAt) < 86_400_000),
  );
}
