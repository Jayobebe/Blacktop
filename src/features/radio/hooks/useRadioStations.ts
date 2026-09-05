import { useSyncExternalStore } from 'react';
import type { AccentColor } from '@/features/settings';
import type { RadioIcon, RadioStation, RadioTrack } from '../types';
import { loadStations, saveStation, deleteStationRecord, clearStations } from '../lib/stationDb';
import { forgetFile } from '../lib/audioFiles';

/**
 * Module-level singleton store (the established cross-cutting state pattern in
 * this codebase) backed by IndexedDB, so File System Access handles survive.
 */
interface StationsState {
  stations: RadioStation[];
  loaded: boolean;
}

let state: StationsState = { stations: [], loaded: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: Partial<StationsState>) {
  state = { ...state, ...next };
  emit();
}

let hydrating: Promise<void> | null = null;

export function hydrateStations(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = loadStations().then((stations) => {
    setState({ stations: stations.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), loaded: true });
  });
  return hydrating;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  void hydrateStations();
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return state;
}

export function getStations() {
  return state.stations;
}

export function getStation(id: string | null) {
  if (!id) return null;
  return state.stations.find((s) => s.id === id) || null;
}

export async function createStation(input: {
  name: string;
  color: AccentColor;
  icon: RadioIcon;
  tracks: RadioTrack[];
}): Promise<RadioStation> {
  const station: RadioStation = {
    id: `stn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim() || 'Untitled Station',
    color: input.color,
    icon: input.icon,
    tracks: input.tracks,
    createdAt: new Date().toISOString(),
  };
  setState({ stations: [...state.stations, station] });
  await saveStation(station);
  return station;
}

export async function updateStation(id: string, patch: Partial<Omit<RadioStation, 'id' | 'createdAt'>>) {
  const existing = state.stations.find((s) => s.id === id);
  if (!existing) return;
  const next = { ...existing, ...patch };
  setState({ stations: state.stations.map((s) => (s.id === id ? next : s)) });
  await saveStation(next);
}

export async function addTracks(id: string, tracks: RadioTrack[]) {
  const existing = state.stations.find((s) => s.id === id);
  if (!existing) return;
  await updateStation(id, { tracks: [...existing.tracks, ...tracks] });
}

export async function removeTrack(id: string, trackId: string) {
  const existing = state.stations.find((s) => s.id === id);
  if (!existing) return;
  forgetFile(trackId);
  await updateStation(id, { tracks: existing.tracks.filter((t) => t.id !== trackId) });
}

export async function deleteStation(id: string) {
  const existing = state.stations.find((s) => s.id === id);
  existing?.tracks.forEach((t) => forgetFile(t.id));
  setState({ stations: state.stations.filter((s) => s.id !== id) });
  await deleteStationRecord(id);
}

/** Burn-button support: wipe every station from the device. */
export async function burnRadioStations() {
  state.stations.forEach((s) => s.tracks.forEach((t) => forgetFile(t.id)));
  setState({ stations: [] });
  await clearStations();
}

export function useRadioStations() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { stations: snap.stations, loaded: snap.loaded };
}
