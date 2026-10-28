/**
 * Asks the map's search bar to run a search when it next can: a quick-search
 * category ("fuel near me") or typed words. Blacktop Console's quick actions and
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
  /** The hazard reports near the rider, as a quick search: listed, the camera pulled out over them. */
  hazards?: boolean;
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

// ── A place to go, Twisty or Direct, from outside the map ──────────────────

/**
 * A convoy leader accepting a passenger's request (convoy/lib/routeRequest):
 * the map goes there exactly as its own Twisty or Direct on a place's card does
 * (the convoy's destination, twisty legs as its stops, guidance for everyone).
 * Taken by `BlacktopMap` once it has a map.
 */
export interface MapPlaceRequest {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  style: 'twisty' | 'direct';
}

let pendingPlace: MapPlaceRequest | null = null;
let placeSeq = 0;
const placeListeners = new Set<() => void>();

export function requestMapPlace(req: MapPlaceRequest) {
  pendingPlace = req;
  placeSeq += 1;
  placeListeners.forEach((l) => l());
}

export function takeMapPlace(): MapPlaceRequest | null {
  const r = pendingPlace;
  pendingPlace = null;
  return r;
}

export function useMapPlaceSeq(): number {
  return useSyncExternalStore(
    (l) => {
      placeListeners.add(l);
      return () => placeListeners.delete(l);
    },
    () => placeSeq,
    () => placeSeq,
  );
}
