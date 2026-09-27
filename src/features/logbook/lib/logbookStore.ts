import { useSyncExternalStore } from 'react';
import { aggregateRides, emptyAggregate, mergeAggregates, type BurnedAggregate } from '@/features/ride/lib/tripBurner';
import type { RideSession } from '@/types/blacktop';
import { useDemoMode, DEMO_BIKE_ID, DEMO_LOGBOOK } from '@/lib/demoMode';
import type { InheritedLog, LogNote, LogRide } from '../types';

/**
 * Per-vehicle history inherited from previous owners, keyed by the local
 * bike id. Kept apart from ride history so it feeds the vehicle's stats and
 * card without touching the new owner's own totals.
 */
export const LOGBOOK_KEY = 'bt.logbooks.v1';

type Store = Record<string, InheritedLog>;

function read(): Store {
  try {
    const raw = localStorage.getItem(LOGBOOK_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

let store: Store = read();
const listeners = new Set<() => void>();

function write(next: Store) {
  store = next;
  try {
    localStorage.setItem(LOGBOOK_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[Logbook] save failed', e);
  }
  listeners.forEach((l) => l());
}

export function getInheritedLog(bikeId: string): InheritedLog | null {
  return store[bikeId] ?? null;
}

export function setInheritedLog(bikeId: string, log: InheritedLog | null) {
  const next = { ...store };
  if (log) next[bikeId] = log;
  else delete next[bikeId];
  write(next);
}

/** Adds a remark to a vehicle's logbook (creating its record if needed). */
export function addLogNote(bikeId: string, note: Omit<LogNote, 'id' | 'at'>) {
  const text = note.text.trim().slice(0, NOTE_MAX_CHARS);
  if (!text) return;
  const prev: InheritedLog = store[bikeId] ?? { owners: [], rides: [], archived: emptyAggregate() };
  const entry: LogNote = { id: crypto.randomUUID(), at: Date.now(), author: note.author, text };
  setInheritedLog(bikeId, { ...prev, notes: [...(prev.notes ?? []), entry] });
}

export const NOTE_MAX_CHARS = 280;

export function clearAllLogbooks() {
  write({});
}

const DEMO_STORE: Store = { [DEMO_BIKE_ID]: DEMO_LOGBOOK as InheritedLog };

export function useInheritedLogs(): Store {
  const real = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store,
    () => store,
  );
  // Demo mode shows the demo bike's logbook history; real logbooks are untouched.
  const { enabled: demoEnabled } = useDemoMode();
  return demoEnabled ? DEMO_STORE : real;
}

/** Totals of everything a vehicle did before it came to this rider. */
export function inheritedAggregate(log: InheritedLog | null | undefined): BurnedAggregate {
  if (!log) return emptyAggregate();
  return mergeAggregates(aggregateRides(log.rides), log.archived ?? emptyAggregate());
}

export function toLogRide(r: RideSession, owner: string): LogRide {
  return {
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    name: r.name,
    isConvoyRide: r.isConvoyRide,
    distance: r.distance,
    duration: r.duration,
    averageSpeed: r.averageSpeed,
    maxSpeed: r.maxSpeed,
    maxLeanLeft: r.maxLeanLeft,
    maxLeanRight: r.maxLeanRight,
    maxGForce: r.maxGForce,
    earnedBadges: r.earnedBadges,
    challenge: r.challenge
      ? {
          vehicleName: r.challenge.vehicleName,
          ownerName: r.challenge.ownerName,
          role: r.challenge.role,
          timeSec: r.challenge.timeSec,
          targetSec: r.challenge.targetSec,
          result: r.challenge.result,
        }
      : undefined,
    owner,
  };
}
