import { useSyncExternalStore } from 'react';
import type { Invite, MergeRecord, NearbyParty, NearbyRider } from '../types';

/**
 * Module-level store for nearby riders (same pattern as convoy/ride state):
 * the engine hook writes, the map and prompt UI read.
 */

export interface ProximityState {
  active: boolean;
  riders: NearbyRider[];
  parties: NearbyParty[];
  /** Invite waiting on this rider's answer. */
  incoming: Invite | null;
  /** Invite this rider sent and is waiting on. */
  outgoing: (Invite & { toName: string }) | null;
  /** Set while a pair/join/merge is being carried out. */
  busy: string | null;
  merge: MergeRecord | null;
  /** Handshake panel on the map: the nearby list, or an incoming request. */
  panel: 'list' | 'request' | null;
}

const SNOOZE_KEY = 'blacktop_prox_snoozed';
const BLOCK_KEY = 'blacktop_prox_blocked';
const MERGE_KEY = 'blacktop_convoy_merge';

export const SNOOZE_MS = 30 * 60 * 1000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode: in-memory state still works this session */
  }
}

let state: ProximityState = {
  active: false,
  riders: [],
  parties: [],
  incoming: null,
  outgoing: null,
  busy: null,
  merge: read<MergeRecord | null>(MERGE_KEY, null),
  panel: null,
};

const listeners = new Set<() => void>();

export function getProximityState(): ProximityState {
  return state;
}

export function setProximityState(patch: Partial<ProximityState>) {
  state = { ...state, ...patch };
  if ('merge' in patch) write(MERGE_KEY, patch.merge ?? null);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProximityState(): ProximityState {
  return useSyncExternalStore(subscribe, getProximityState, getProximityState);
}

// ── Snooze ("Not now") and block, per party / per rider ─────────────────────

export function isSnoozed(partyKey: string): boolean {
  const until = read<Record<string, number>>(SNOOZE_KEY, {})[partyKey];
  return !!until && until > Date.now();
}

export function snoozeParty(partyKey: string) {
  const now = Date.now();
  const all = read<Record<string, number>>(SNOOZE_KEY, {});
  // Drop expired entries so the map doesn't grow forever.
  const next: Record<string, number> = {};
  for (const [k, until] of Object.entries(all)) if (until > now) next[k] = until;
  next[partyKey] = now + SNOOZE_MS;
  write(SNOOZE_KEY, next);
  listeners.forEach((l) => l());
}

export function getBlocked(): string[] {
  return read<string[]>(BLOCK_KEY, []);
}

export function isBlocked(userId: string): boolean {
  return getBlocked().includes(userId);
}

export function blockRider(userId: string) {
  const list = getBlocked();
  if (!list.includes(userId)) write(BLOCK_KEY, [...list, userId]);
  listeners.forEach((l) => l());
}

export function unblockRider(userId: string) {
  write(BLOCK_KEY, getBlocked().filter((id) => id !== userId));
  listeners.forEach((l) => l());
}

export function clearBlocked() {
  write(BLOCK_KEY, null);
  listeners.forEach((l) => l());
}
