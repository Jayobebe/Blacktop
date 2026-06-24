import { useSyncExternalStore } from 'react';
import { MapDestination } from '../types';

interface MapOverlayState {
  isOpen: boolean;
  destination: MapDestination | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let overlayState: MapOverlayState = {
  isOpen: false,
  destination: null,
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
  overlayState = { isOpen: true, destination: destination ?? null };
  emitChange();
}

export function closeBlacktopMap() {
  overlayState = { isOpen: false, destination: null };
  emitChange();
}

export function useMapOverlay(): MapOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
