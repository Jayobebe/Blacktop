/**
 * Which quick actions the rider keeps on Blacktop Command, in their order: up
 * to MAX_QUICK_ACTIONS ids from the catalogue (lib/actions). Kept on the phone
 * (`blacktop_quick_actions`, carried by backups: they're the rider's own
 * choice). Until the rider picks, the defaults stand in (`chosen` is null).
 */
import { useSyncExternalStore } from 'react';

export const MAX_QUICK_ACTIONS = 9;
const KEY = 'blacktop_quick_actions';

function load(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX_QUICK_ACTIONS) : null;
  } catch {
    return null;
  }
}

let chosen: string[] | null = typeof window !== 'undefined' ? load() : null;
const listeners = new Set<() => void>();

export function setQuickActions(ids: string[]) {
  chosen = [...new Set(ids)].slice(0, MAX_QUICK_ACTIONS);
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}

/** The rider's ids, or null while they've never chosen (the defaults stand in). */
export function useChosenQuickActions(): string[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => chosen,
    () => chosen,
  );
}

/**
 * Rows for `n` tiles: three to a row in order, the last row taking what's
 * left (its tiles stretch across the width): 4 is three and one, 8 is three,
 * three and two.
 */
export function rowSizes(n: number): number[] {
  const rows: number[] = [];
  for (let left = n; left > 0; left -= 3) rows.push(Math.min(3, left));
  return rows;
}
