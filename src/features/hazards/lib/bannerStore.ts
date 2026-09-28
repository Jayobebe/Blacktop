import { useSyncExternalStore } from 'react';
import type { Hazard } from '../types';

/**
 * The hazard warning currently showing. HazardAlerts sets it; with the map
 * open, BlacktopMap shows it in the search bar's slot (like the turn and
 * convoy cards), otherwise HazardAlerts shows it at the top of the screen.
 */
export interface HazardWarning {
  hazard: Hazard;
  distance: number;
}

let current: HazardWarning | null = null;
const listeners = new Set<() => void>();

export function setHazardWarning(next: HazardWarning | null | ((prev: HazardWarning | null) => HazardWarning | null)) {
  current = typeof next === 'function' ? next(current) : next;
  listeners.forEach((l) => l());
}

export function useHazardWarning(): HazardWarning | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
