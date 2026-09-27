import { useSyncExternalStore } from 'react';
import type { TelemetrySample, TrackDef, TrackSession } from '../types';

/** Saved tracks and finished sessions, on this device. */
const TRACKS_KEY = 'bt.tracks.v1';
const SESSIONS_KEY = 'bt.track_sessions.v1';
/** Keep session telemetry bounded (≈ 1 h at 5 Hz). */
const MAX_SAMPLES = 18_000;
const MAX_SESSIONS = 40;

interface Store {
  tracks: TrackDef[];
  sessions: TrackSession[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let store: Store = { tracks: read(TRACKS_KEY, []), sessions: read(SESSIONS_KEY, []) };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[Track] save failed', e);
    return false;
  }
}

export function useTrackStore(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store,
    () => store,
  );
}

export function getTracks() {
  return store.tracks;
}

export function saveTrack(track: TrackDef) {
  const tracks = [track, ...store.tracks.filter((t) => t.id !== track.id)];
  store = { ...store, tracks };
  persist(TRACKS_KEY, tracks);
  emit();
}

export function deleteTrack(id: string) {
  const tracks = store.tracks.filter((t) => t.id !== id);
  store = { ...store, tracks };
  persist(TRACKS_KEY, tracks);
  emit();
}

function thin(samples: TelemetrySample[]): TelemetrySample[] {
  if (samples.length <= MAX_SAMPLES) return samples;
  const step = samples.length / MAX_SAMPLES;
  const out: TelemetrySample[] = [];
  for (let i = 0; i < MAX_SAMPLES; i++) out.push(samples[Math.floor(i * step)]);
  return out;
}

/** Saves a finished session; drops the oldest sessions' telemetry if storage is tight. */
export function saveSession(session: TrackSession): boolean {
  const s = { ...session, samples: thin(session.samples) };
  let sessions = [s, ...store.sessions.filter((x) => x.id !== s.id)].slice(0, MAX_SESSIONS);
  let ok = persist(SESSIONS_KEY, sessions);
  // Out of space: keep lap times for older sessions, drop their traces.
  for (let i = sessions.length - 1; !ok && i > 0; i--) {
    sessions = sessions.map((x, j) => (j === i ? { ...x, samples: [] } : x));
    ok = persist(SESSIONS_KEY, sessions);
  }
  store = { ...store, sessions };
  emit();
  return ok;
}

export function deleteSession(id: string) {
  const sessions = store.sessions.filter((x) => x.id !== id);
  store = { ...store, sessions };
  persist(SESSIONS_KEY, sessions);
  emit();
}

export function clearTrackData() {
  store = { tracks: [], sessions: [] };
  try {
    localStorage.removeItem(TRACKS_KEY);
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    /* ignore */
  }
  emit();
}
