/**
 * Whether the Garage has something to look at: a service due or coming up
 * (Home's Garage button glows, like Stats and Settings, until the Garage is
 * opened). `MaintenanceNotifier` (App), which already works out every
 * vehicle's odometer, reports each vehicle's services due or due soon here as
 * keys (vehicle, service, how due, since when); opening the Garage marks the
 * ones there are as seen (`blacktop_garage_seen`, left out of backups: it's
 * only a "seen" mark). A service that goes from due soon to overdue, or comes
 * due again after it's done, glows again. In demo mode the demo bike's services
 * glow the same way, the seen mark kept in memory only (`setGarageDemo`), so
 * the demo shows it off and a real account's mark is never touched. Imports
 * nothing, so Home stays light.
 */
import { useSyncExternalStore } from 'react';

const SEEN_KEY = 'blacktop_garage_seen';
const byBike = new Map<string, string[]>();
const listeners = new Set<() => void>();

function readSeen(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}
let seen = readSeen();
let fresh = false;
/** In demo mode: what's been seen this time round, in memory (null otherwise). */
let demoSeen: Set<string> | null = null;

function recompute() {
  const s = demoSeen ?? seen;
  const next = [...byBike.values()].some((keys) => keys.some((k) => !s.has(k)));
  if (next !== fresh) {
    fresh = next;
    listeners.forEach((l) => l());
  }
}

/** One vehicle's services due or due soon, as keys (MaintenanceNotifier). */
export function setGarageDue(bikeId: string, keys: string[]) {
  byBike.set(bikeId, keys);
  recompute();
}

/** A vehicle gone from the garage. */
export function clearGarageDue(bikeId: string) {
  byBike.delete(bikeId);
  recompute();
}

/** Demo mode on or off: its seen marks start afresh, in memory. */
export function setGarageDemo(on: boolean) {
  if (on === !!demoSeen) return;
  demoSeen = on ? new Set() : null;
  recompute();
}

/** The Garage was opened: what's due now has been seen. */
export function markGarageSeen() {
  const now = [...byBike.values()].flat();
  if (demoSeen) {
    if (now.every((k) => demoSeen!.has(k))) return;
    demoSeen = new Set(now);
    recompute();
    return;
  }
  if (now.every((k) => seen.has(k))) return;
  seen = new Set(now);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* this launch only */
  }
  recompute();
}

/** True while a service is due or coming up that the Garage hasn't been opened on since. */
export function useGarageNews(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => fresh,
    () => false,
  );
}
