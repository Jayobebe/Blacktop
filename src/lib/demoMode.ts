import { useSyncExternalStore } from 'react';
import type { RideStats } from '@/types/blacktop';
import type { ArcadeScores } from '@/features/arcade/types';

/**
 * Demo-mode store. When enabled, read-only overrides are surfaced for:
 *  - profile name
 *  - ride stats
 *  - arcade high scores
 *  - "active riders" count on the World globe (fluctuates 12-47)
 *
 * Real user data is never written or overwritten — toggling off restores
 * personal data exactly as it was.
 */

const LS_KEY = 'blacktop_demo_mode';

export const DEMO_NAME = 'Demo Rider';

export const DEMO_STATS: RideStats = {
  totalRides: 47,
  totalDistance: 1234, // miles
  totalDuration: 89 * 3600 + 12 * 60, // ~89h 12m
  personalTopSpeed: 142,
  personalMaxGForce: 1.6,
  averageRideLength: 1234 / 47,
  convoyRides: 18,
  badges: { speedDemon: 12, journeyman: 9, fallback: 4 },
};

export const DEMO_SCORES: ArcadeScores = {
  'hit-heavy': 8540,
  'petrol-head': 12300,
};

const ACTIVE_MIN = 12;
const ACTIVE_MAX = 47; // strictly < 50

function randomActive(prev: number): number {
  // Random walk that stays inside [ACTIVE_MIN, ACTIVE_MAX]
  const delta = Math.floor(Math.random() * 7) - 3; // -3..+3
  let next = prev + delta;
  if (next < ACTIVE_MIN) next = ACTIVE_MIN + Math.floor(Math.random() * 3);
  if (next > ACTIVE_MAX) next = ACTIVE_MAX - Math.floor(Math.random() * 3);
  return next;
}

interface DemoState {
  enabled: boolean;
  activeRiders: number;
}

let state: DemoState = {
  enabled: (() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  })(),
  activeRiders: 24,
};

const listeners = new Set<() => void>();
let tickHandle: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const l of listeners) l();
}

function startTicker() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    state = { ...state, activeRiders: randomActive(state.activeRiders) };
    emit();
  }, 2500);
}

function stopTicker() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

if (state.enabled) startTicker();

export function setDemoMode(on: boolean) {
  if (state.enabled === on) return;
  state = { ...state, enabled: on };
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch {}
  if (on) startTicker(); else stopTicker();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return state;
}

export function useDemoMode() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return s;
}

/** Non-reactive read for callers that don't need to re-render on toggle. */
export function isDemoModeActive(): boolean {
  return state.enabled;
}
