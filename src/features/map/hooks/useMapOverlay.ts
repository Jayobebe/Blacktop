import { useSyncExternalStore } from 'react';
import { MapDestination } from '../types';

interface MapOverlayState {
  isOpen: boolean;
  destination: MapDestination | null;
  /** The map has drawn its first full view (style + tiles). Until then the app backdrop shows through. */
  ready: boolean;
  /** Bumped when the home map closes: BlacktopMap ends its route and guidance. */
  resetSeq: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let overlayState: MapOverlayState = {
  isOpen: false,
  destination: null,
  ready: false,
  resetSeq: 0,
};

function getSnapshot(): MapOverlayState {
  return overlayState;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach((l) => l());
}

export function openBlacktopMap(destination?: MapDestination) {
  // If a destination is provided, update it; otherwise keep the existing one.
  overlayState = {
    ...overlayState,
    isOpen: true,
    destination: destination !== undefined ? (destination ?? null) : overlayState.destination,
  };
  emitChange();
}

// Closes the map but intentionally keeps the destination so the next open
// (e.g. returning from active ride) restores the same route automatically.
export function closeBlacktopMap() {
  overlayState = { ...overlayState, isOpen: false };
  emitChange();
}

// Call this when the ride ends or the user returns to Home so the destination
// doesn't bleed into a completely different session.
export function clearMapDestination() {
  overlayState = { ...overlayState, destination: null };
  emitChange();
}

/**
 * The home map (opened from Home, not a ride or a lobby) was closed: drop the
 * destination and tell the still-mounted map to end its route and guidance, so
 * directions don't carry on behind the home screen.
 */
export function resetBlacktopMap() {
  overlayState = { ...overlayState, destination: null, resetSeq: overlayState.resetSeq + 1 };
  emitChange();
}

/** BlacktopMap reports its first full draw (and resets it when the map is torn down). */
export function setBlacktopMapReady(ready: boolean) {
  if (overlayState.ready === ready) return;
  overlayState = { ...overlayState, ready };
  emitChange();
}

export function useMapOverlay(): MapOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
