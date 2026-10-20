/**
 * Asks the map's search bar to run a search when it next can: a quick-search
 * category ("fuel near me") or typed words. Blacktop Command's quick actions and
 * its search use it with `openBlacktopMap()`; the search bar (MapSearchBar)
 * takes the request once it's mounted with a map, so it works on the map's
 * first open too. Imports nothing heavy (Home's first load reads it).
 */
import { useSyncExternalStore } from 'react';

export interface MapSearchRequest {
  /** A quick-search category id (`placeCategories`): gas / charge / water, parking, coffee… */
  category?: string;
  /** Words to search for. */
  query?: string;
}

let pending: MapSearchRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export function requestMapSearch(req: MapSearchRequest) {
  pending = req;
  seq += 1;
  listeners.forEach((l) => l());
}

/** The request waiting, taken (so it runs once). */
export function takeMapSearch(): MapSearchRequest | null {
  const r = pending;
  pending = null;
  return r;
}

/** Bumps when a request comes in. */
export function useMapSearchSeq(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => seq,
    () => seq,
  );
}
