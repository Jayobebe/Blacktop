import { useSyncExternalStore } from 'react';
import type { RideSession, RideStats } from '@/types/blacktop';
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
  // Very slow random walk — at most ±1 per tick, clamped inside bounds.
  const delta = Math.random() < 0.5 ? -1 : 1;
  let next = prev + delta;
  if (next < ACTIVE_MIN) next = ACTIVE_MIN + 1;
  if (next > ACTIVE_MAX) next = ACTIVE_MAX - 1;
  return next;
}

/**
 * ISO 3166-1 numeric country codes used by world-atlas/countries-110m.
 * Demo-mode glow weights (higher = brighter). Slightly varied so the
 * map feels alive without strobing.
 */
export const DEMO_COUNTRY_LIGHTS: Record<number, number> = {
  840: 14, // United States
  826: 9,  // United Kingdom
  380: 7,  // Italy
  764: 5,  // Thailand
  156: 11, // China
};

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
    // ~40% chance to actually move each tick — keeps the count drifting
    // very slowly (a step every ~30-50s on average).
    if (Math.random() > 0.4) return;
    state = { ...state, activeRiders: randomActive(state.activeRiders) };
    emit();
  }, 18000);
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
