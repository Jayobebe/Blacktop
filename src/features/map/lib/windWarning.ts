// The side-wind warning showing now (map/lib/windRoute): set by the Blacktop
// map while it guides (it stays mounted, hidden, during a ride), shown in the
// map's top slot, at the top of the ride screen with the map closed
// (WindAlertHost) and in the mini map's pill. Imports nothing heavy, so the
// eager ride screen can read it.
import { useSyncExternalStore } from 'react';

export interface WindWarning {
  /** Which stretch (its distance along the route), so each is announced once. */
  id: number;
  side: 'left' | 'right';
  /** The side-on gust, km/h. */
  crossKmh: number;
  level: 'warn' | 'strong';
  /** Metres until it. */
  distance: number;
}

let current: WindWarning | null = null;
const listeners = new Set<() => void>();

export function setWindWarning(next: WindWarning | null) {
  if (next === current || (next && current && next.id === current.id && next.distance === current.distance && next.crossKmh === current.crossKmh)) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useWindWarning(): WindWarning | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export function windColour(level: 'warn' | 'strong'): string {
  return level === 'strong' ? '#ef4444' : '#f59e0b';
}
