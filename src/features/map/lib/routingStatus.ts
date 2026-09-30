import { useSyncExternalStore } from 'react';

/**
 * Whether the router (the place-search function) can be reached right now:
 * set by fetchRouteThroughStops, read by the map to show a calm "Offline —
 * following GPS track" chip instead of flashing or retrying hard. The last
 * route stays drawn and the rider keeps following their GPS position.
 */
let offline = false;
const listeners = new Set<() => void>();

export function setRoutingOffline(next: boolean) {
  if (next === offline) return;
  offline = next;
  listeners.forEach((l) => l());
}

export const isRoutingOffline = () => offline;

export function useRoutingOffline(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offline,
    () => false,
  );
}
