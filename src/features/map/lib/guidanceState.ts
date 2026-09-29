// Whether the Blacktop map is giving turn-by-turn right now, for screens that
// must behave differently while the rider is being guided (e.g. Home locks its
// swipe deck). Set by BlacktopMap; module-level store like the rest of the app.
import { useSyncExternalStore } from 'react';

let guiding = false;
const listeners = new Set<() => void>();

export function setGuidanceActive(next: boolean) {
  if (guiding === next) return;
  guiding = next;
  listeners.forEach((l) => l());
}

export function isGuidanceActive(): boolean {
  return guiding;
}

export function useGuidanceActive(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => guiding,
  );
}
