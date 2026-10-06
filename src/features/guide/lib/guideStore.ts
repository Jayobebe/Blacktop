import { useSyncExternalStore } from 'react';

/**
 * First-time tips: each page shows its few tips the first time it's opened,
 * and never again once they're finished or skipped. "Skip all" stops every
 * page's. Kept on the phone only; Settings can bring them all back.
 */
export const GUIDE_KEY = 'blacktop_page_tips';

interface Seen {
  /** Pages whose tips have been shown. */
  pages: string[];
  /** The rider asked for no more tips anywhere. */
  off: boolean;
}

function load(): Seen {
  try {
    const raw = JSON.parse(localStorage.getItem(GUIDE_KEY) || 'null');
    if (raw && Array.isArray(raw.pages)) return { pages: raw.pages.filter((p: unknown) => typeof p === 'string'), off: !!raw.off };
  } catch {
    // Start afresh.
  }
  return { pages: [], off: false };
}

let seen = load();
const listeners = new Set<() => void>();
function set(next: Seen) {
  seen = next;
  try {
    localStorage.setItem(GUIDE_KEY, JSON.stringify(next));
  } catch {
    // Shown again another day, which is no harm.
  }
  listeners.forEach((l) => l());
}

export const tipsDue = (page: string) => !seen.off && !seen.pages.includes(page);
export function markTipsSeen(page: string) {
  if (!seen.pages.includes(page)) set({ ...seen, pages: [...seen.pages, page] });
}
export function skipAllTips() {
  set({ ...seen, off: true });
}
/** Settings → Show tips again. */
export function resetTips() {
  set({ pages: [], off: false });
}

export function useTipsDue(page: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tipsDue(page),
    () => tipsDue(page),
  );
}
