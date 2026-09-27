import { useSyncExternalStore } from 'react';

/**
 * Operator (riding the bike) or pillion (passenger). Chosen when joining a
 * convoy and kept on this device only: a pillion gets every lobby permission
 * an operator has, but enters the ride on the passenger screen (voice,
 * reactions, rescue) instead of the ride tracker, so their phone never adds
 * a duplicate marker, stats or a saved ride for the same bike.
 */
export type RideRole = 'operator' | 'pillion';

interface RoleState {
  role: RideRole;
  /** True once the convoy ride has started for this pillion (survives reloads). */
  riding: boolean;
}

const KEY = 'blacktop_ride_role';
const DEFAULT: RoleState = { role: 'operator', riding: false };

function read(): RoleState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<RoleState>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let state: RoleState = read();
const listeners = new Set<() => void>();

function set(next: RoleState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* in-memory is enough for this session */
  }
  listeners.forEach((l) => l());
}

export function getRideRole(): RoleState {
  return state;
}

export function setRideRole(role: RideRole) {
  set({ role, riding: false });
}

export function setPillionRiding(riding: boolean) {
  set({ ...state, riding });
}

/** Back to the default (operator) — on leaving a convoy or when a ride ends. */
export function clearRideRole() {
  set(DEFAULT);
}

export function useRideRole(): RoleState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
