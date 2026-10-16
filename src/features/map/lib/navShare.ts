// What the Blacktop map's turn-by-turn knows, shared with the ride screen's
// mini map (ride/components/RideDial): the route line being guided along and
// the next turn with how far off it is. Set by BlacktopMap while it guides
// (it stays mounted, hidden, during a ride); empty otherwise. Module-level
// store like the rest of the app; imports nothing heavy, so the eager ride
// screen can read it.
import { useSyncExternalStore } from 'react';

export interface SharedTurn {
  type: string;
  modifier?: string;
  /** Which side traffic drives on (roundabouts turn the other way round). */
  side?: 'left' | 'right';
}

/** A traffic camera just announced ahead (the map's approach alert). */
export interface SharedCamera {
  type: string;
  lat: number;
  lng: number;
  maxspeed?: string;
  /** When it was announced (ms): it's dropped once passed, or after a couple of minutes. */
  at: number;
}

export interface NavShare {
  /** The route line as [lng, lat] pairs, or null without one. */
  route: Array<[number, number]> | null;
  next: SharedTurn | null;
  /** Metres to `next`. */
  distanceToNext: number | null;
  camera: SharedCamera | null;
}

let state: NavShare = { route: null, next: null, distanceToNext: null, camera: null };
const listeners = new Set<() => void>();

export function setNavShare(patch: Partial<NavShare>) {
  const next = { ...state, ...patch };
  if (next.route === state.route && next.next === state.next && next.distanceToNext === state.distanceToNext && next.camera === state.camera) return;
  state = next;
  listeners.forEach((l) => l());
}

export function useNavShare(): NavShare {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
