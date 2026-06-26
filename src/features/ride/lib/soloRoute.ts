// Lightweight module-level store for the solo rider's planned route.
//
// Solo rides have no convoy row to back waypoints, so we persist the
// chosen destination + intermediate stops here so they survive:
//   • SoloLobby → ActiveRide navigation
//   • Closing & reopening the Blacktop map mid-ride
//
// The store is cleared by ActiveRide when a ride ends so the home map
// doesn't inherit a stale route from a previous session.
import { useSyncExternalStore } from 'react';

export interface SoloStop {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export interface SoloRouteState {
  destination: SoloStop | null;
  stops: SoloStop[];
}

const MAX_STOPS = 5;

let state: SoloRouteState = { destination: null, stops: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

export function setSoloRoute(next: { destination: SoloStop | null; stops?: SoloStop[] }) {
  state = {
    destination: next.destination,
    stops: (next.stops ?? []).slice(0, MAX_STOPS),
  };
  emit();
}

export function clearSoloRoute() {
  if (!state.destination && state.stops.length === 0) return;
  state = { destination: null, stops: [] };
  emit();
}

export function addSoloStop(stop: SoloStop) {
  if (state.stops.length >= MAX_STOPS) return;
  state = { ...state, stops: [...state.stops, stop] };
  emit();
}

export function removeSoloStopAt(index: number) {
  if (index < 0 || index >= state.stops.length) return;
  state = { ...state, stops: state.stops.filter((_, i) => i !== index) };
  emit();
}

export function useSoloRoute(): SoloRouteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
