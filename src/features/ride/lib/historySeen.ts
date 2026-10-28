/**
 * Rides not opened yet: Home's History button glows, like Stats and Settings,
 * while a ride that ended since Blacktop started keeping track hasn't been
 * opened (its receipt, its trip, or tapping the receipt as it lands on Home).
 * Kept as `blacktop_history_seen` ({ since, ids }, left out of backups: it's
 * only a "seen" mark); `since` is when it was first read, so rides from before
 * don't all glow at once. In demo mode the demo's newest ride glows until it's
 * opened (`isDemoRideNew`), the mark kept in memory, so the demo shows it off
 * and a real account's marks are never touched. Imports nothing, so Home stays
 * light.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'blacktop_history_seen';
const KEEP = 300;

type Seen = { since: number; ids: string[] };
const listeners = new Set<() => void>();

function load(): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.since === 'number' && Array.isArray(v.ids)) return { since: v.since, ids: v.ids.filter((i: unknown) => typeof i === 'string') };
  } catch {
    /* start afresh */
  }
  const fresh = { since: Date.now(), ids: [] };
  save(fresh);
  return fresh;
}
function save(s: Seen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* this launch only */
  }
}
let state = load();
/** Demo rides opened this time round, and whether Clear all has been pressed (in memory only). */
const demoSeen = new Set<string>();
let demoCleared = false;
const isDemoId = (id: string) => id.startsWith('demo-');

/** Opened: this ride (or these, a trip's) isn't new any more. */
export function markRidesSeen(ids: string[]) {
  const demo = ids.filter((id) => id && isDemoId(id) && !demoSeen.has(id));
  if (demo.length) {
    demo.forEach((id) => demoSeen.add(id));
    state = { ...state };
    listeners.forEach((l) => l());
  }
  const add = ids.filter((id) => id && !isDemoId(id) && !state.ids.includes(id));
  if (!add.length) return;
  state = { since: state.since, ids: [...state.ids, ...add].slice(-KEEP) };
  save(state);
  listeners.forEach((l) => l());
}

/** Everything so far counts as seen (the Console's Clear all). */
export function markAllRidesSeen() {
  demoCleared = true;
  state = { since: Date.now(), ids: [] };
  save(state);
  listeners.forEach((l) => l());
}

/** Whether this ride is new (ended since tracking began, never opened). */
export function isRideNew(ride: { id: string; endedAt?: string | number | null }): boolean {
  if (!ride.endedAt) return false;
  const ended = typeof ride.endedAt === 'number' ? ride.endedAt : Date.parse(ride.endedAt);
  return Number.isFinite(ended) && ended > state.since && !state.ids.includes(ride.id);
}

/** Demo mode: whether this is the demo's newest ride and it hasn't been opened yet. */
export function isDemoRideNew(ride: { id: string }, rides: Array<{ id: string; endedAt?: string | number | null }>): boolean {
  if (demoCleared || demoSeen.has(ride.id)) return false;
  let newest: { id: string; at: number } | null = null;
  for (const r of rides) {
    if (!r.endedAt) continue;
    const at = typeof r.endedAt === 'number' ? r.endedAt : Date.parse(r.endedAt);
    if (Number.isFinite(at) && (!newest || at > newest.at)) newest = { id: r.id, at };
  }
  return newest?.id === ride.id;
}

/** Bumps whenever a ride is marked seen. */
export function useHistorySeen(): Seen {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
