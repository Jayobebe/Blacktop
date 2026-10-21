/**
 * The calendar clock's stopwatch: kept as when it was started and what had
 * built up before (not a ticking count), so it carries on while the rider is
 * elsewhere in the app or the app is closed. Laps are split times. Kept on the
 * phone (`blacktop_stopwatch`, left out of backups: it belongs to the moment).
 */
import { useSyncExternalStore } from 'react';

export interface StopwatchState {
  /** When it was last started (ms), null while stopped. */
  runningSince: number | null;
  /** Time built up before that start, ms. */
  banked: number;
  /** Elapsed time at each lap, ms, newest first. */
  laps: number[];
}

const KEY = 'blacktop_stopwatch';
const listeners = new Set<() => void>();

function read(): StopwatchState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as StopwatchState | null;
    if (v && typeof v.banked === 'number' && Array.isArray(v.laps)) return v;
  } catch {
    /* start afresh */
  }
  return { runningSince: null, banked: 0, laps: [] };
}

let state = typeof window !== 'undefined' ? read() : { runningSince: null, banked: 0, laps: [] };

function set(next: StopwatchState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

export const elapsed = (s: StopwatchState, now = Date.now()) => s.banked + (s.runningSince ? now - s.runningSince : 0);

export function startStopwatch() {
  if (!state.runningSince) set({ ...state, runningSince: Date.now() });
}
export function stopStopwatch() {
  if (state.runningSince) set({ ...state, banked: elapsed(state), runningSince: null });
}
export function lapStopwatch() {
  if (state.runningSince) set({ ...state, laps: [elapsed(state), ...state.laps].slice(0, 99) });
}
export function resetStopwatch() {
  set({ runningSince: null, banked: 0, laps: [] });
}

export function useStopwatch(): StopwatchState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** mm:ss.cc, or h:mm:ss.cc past an hour. */
export function stopwatchText(ms: number): string {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}.${two(cs)}` : `${two(m)}:${two(s)}.${two(cs)}`;
}
