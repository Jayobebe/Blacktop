import { useSyncExternalStore } from 'react';

/**
 * Local-only crew membership. Mirrors the app's privacy stance: the crew a
 * rider belongs to lives on the device, nothing is published anywhere.
 */
export interface CrewState {
  code: string | null;
  name: string | null;
  joinedAt: number | null;
}

const LS_KEY = 'blacktop_crew';
const listeners = new Set<() => void>();
let snapshot: CrewState = read();

function read(): CrewState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as CrewState;
  } catch {}
  return { code: null, name: null, joinedAt: null };
}

function emit() {
  snapshot = read();
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function joinCrew(code: string, name?: string) {
  const state: CrewState = {
    code: code.trim().toUpperCase(),
    name: name?.trim() || code.trim().toUpperCase(),
    joinedAt: Date.now(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  emit();
}

export function leaveCrew() {
  localStorage.removeItem(LS_KEY);
  emit();
}

export function useCrew() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
