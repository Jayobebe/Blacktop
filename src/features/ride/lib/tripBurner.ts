import { RideSession } from '@/types/blacktop';

/**
 * Burn trips: unstarred rides older than the chosen window are deleted from
 * Ride History to save storage. Their numbers are folded into a small
 * per-vehicle archive first, so lifetime stats (totals, top speed, vehicle
 * odometers and card tiers) don't move when the rides disappear.
 */

export type BurnTripsInterval = 'off' | 'week' | 'month';

export const RIDES_KEY = 'blacktop_rides';
export const BURNED_TOTALS_KEY = 'blacktop_burned_ride_totals';

const INTERVAL_MS: Record<Exclude<BurnTripsInterval, 'off'>, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/** Aggregate of burned rides for one vehicle (or rides with no vehicle). */
export interface BurnedAggregate {
  rides: number;
  convoyRides: number;
  distance: number; // miles
  duration: number; // seconds
  maxSpeed: number; // mph
  maxGForce: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  longestRide: number; // miles
  badges: { speedDemon: number; journeyman: number; fallback: number };
}

/** Keyed by bikeId; rides logged without a vehicle live under NO_BIKE. */
export type BurnedTotals = Record<string, BurnedAggregate>;

export const NO_BIKE = '_none';
export const EMPTY_BURNED_TOTALS: BurnedTotals = {};

export function emptyAggregate(): BurnedAggregate {
  return {
    rides: 0,
    convoyRides: 0,
    distance: 0,
    duration: 0,
    maxSpeed: 0,
    maxGForce: 0,
    maxLeanLeft: 0,
    maxLeanRight: 0,
    longestRide: 0,
    badges: { speedDemon: 0, journeyman: 0, fallback: 0 },
  };
}

/** The ride fields an aggregate needs (full RideSessions and logbook entries both fit). */
export type AggregatableRide = Pick<RideSession, 'isConvoyRide' | 'distance' | 'duration' | 'maxSpeed' | 'maxGForce' | 'maxLeanLeft' | 'maxLeanRight' | 'earnedBadges'>;

function addRide(agg: BurnedAggregate, ride: AggregatableRide): BurnedAggregate {
  const badges = { ...agg.badges };
  for (const badge of ride.earnedBadges ?? []) {
    if (badge === 'speed-demon') badges.speedDemon++;
    else if (badge === 'journeyman') badges.journeyman++;
    else if (badge === 'fallback') badges.fallback++;
  }
  return {
    rides: agg.rides + 1,
    convoyRides: agg.convoyRides + (ride.isConvoyRide ? 1 : 0),
    distance: agg.distance + (ride.distance || 0),
    duration: agg.duration + (ride.duration || 0),
    maxSpeed: Math.max(agg.maxSpeed, ride.maxSpeed || 0),
    maxGForce: Math.max(agg.maxGForce, ride.maxGForce || 0),
    maxLeanLeft: Math.max(agg.maxLeanLeft, ride.maxLeanLeft || 0),
    maxLeanRight: Math.max(agg.maxLeanRight, ride.maxLeanRight || 0),
    longestRide: Math.max(agg.longestRide, ride.distance || 0),
    badges,
  };
}

export function mergeAggregates(a: BurnedAggregate, b: BurnedAggregate): BurnedAggregate {
  return {
    rides: a.rides + b.rides,
    convoyRides: a.convoyRides + b.convoyRides,
    distance: a.distance + b.distance,
    duration: a.duration + b.duration,
    maxSpeed: Math.max(a.maxSpeed, b.maxSpeed),
    maxGForce: Math.max(a.maxGForce, b.maxGForce),
    maxLeanLeft: Math.max(a.maxLeanLeft, b.maxLeanLeft),
    maxLeanRight: Math.max(a.maxLeanRight, b.maxLeanRight),
    longestRide: Math.max(a.longestRide, b.longestRide),
    badges: {
      speedDemon: a.badges.speedDemon + b.badges.speedDemon,
      journeyman: a.badges.journeyman + b.badges.journeyman,
      fallback: a.badges.fallback + b.badges.fallback,
    },
  };
}

/** Burned totals for one vehicle, or across every vehicle when bikeId is omitted. */
export function burnedAggregate(totals: BurnedTotals, bikeId?: string): BurnedAggregate {
  if (bikeId !== undefined) return totals[bikeId] ?? emptyAggregate();
  return Object.values(totals).reduce(mergeAggregates, emptyAggregate());
}

/** Aggregate of a list of rides (e.g. a vehicle's logbook). */
export function aggregateRides(rides: AggregatableRide[]): BurnedAggregate {
  return rides.reduce(addRide, emptyAggregate());
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readInterval(): BurnTripsInterval {
  const value = readJson<{ burnTripsInterval?: BurnTripsInterval }>('blacktop-settings', {}).burnTripsInterval;
  return value === 'week' || value === 'month' ? value : 'off';
}

/**
 * Delete every finished, unstarred ride older than the window. Reads and
 * writes localStorage directly and notifies mounted useLocalStorage hooks, so
 * it can run on app start and whenever the setting changes. Returns how many
 * rides were burned.
 */
export function burnExpiredTrips(interval: BurnTripsInterval = readInterval(), now = Date.now()): number {
  if (interval === 'off') return 0;
  const cutoff = now - INTERVAL_MS[interval];

  const rides = readJson<RideSession[]>(RIDES_KEY, []);
  const expired = (r: RideSession) =>
    !r.starred && r.endedAt !== null && new Date(r.endedAt).getTime() < cutoff;
  const burned = rides.filter(expired);
  if (burned.length === 0) return 0;

  const totals = { ...readJson<BurnedTotals>(BURNED_TOTALS_KEY, {}) };
  for (const ride of burned) {
    const key = ride.bikeId || NO_BIKE;
    totals[key] = addRide(totals[key] ?? emptyAggregate(), ride);
  }

  try {
    // Totals first: if the ride write then fails, the rides are still there
    // and would be counted twice, so roll the totals back.
    const prevTotals = localStorage.getItem(BURNED_TOTALS_KEY);
    localStorage.setItem(BURNED_TOTALS_KEY, JSON.stringify(totals));
    try {
      localStorage.setItem(RIDES_KEY, JSON.stringify(rides.filter((r) => !expired(r))));
    } catch (error) {
      if (prevTotals === null) localStorage.removeItem(BURNED_TOTALS_KEY);
      else localStorage.setItem(BURNED_TOTALS_KEY, prevTotals);
      throw error;
    }
  } catch (error) {
    console.error('[TripBurner] Failed to burn trips', error);
    return 0;
  }

  for (const key of [BURNED_TOTALS_KEY, RIDES_KEY]) {
    window.dispatchEvent(new CustomEvent('bt-local-storage-change', { detail: { key } }));
  }
  return burned.length;
}
