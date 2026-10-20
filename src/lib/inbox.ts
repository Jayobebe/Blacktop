/**
 * The notification centre's inbox (Blacktop Console): what happened to the
 * rider, kept on the phone after the toast or the system notification has
 * gone. Fed by `notify()` from anywhere in the app (rescue calls, riders joining
 * and leaving the convoy, local notifications such as service reminders) and by
 * every push, which the push worker (public/push-sw.js) also saves into the
 * `blacktop-inbox` IndexedDB, so pushes that arrived with the app closed are
 * here when it opens. Imports nothing from the features, so any of them can
 * call it. Never sent anywhere; Burn wipes it (a `blacktop` key and database),
 * and backups leave it out (it belongs to the device).
 */
import { useSyncExternalStore } from 'react';
import { demoInbox, useDemoMode } from '@/lib/demoMode';

export type InboxKind = 'rescue' | 'convoy' | 'crew' | 'service' | 'weather' | 'hazard' | 'cards' | 'track' | 'general';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  body?: string;
  /** Where a tap goes (an in-app path). */
  url?: string;
  /** What it's about, for its button (a service reminder: `maint-<vehicle id>-<item id>`). */
  ref?: string;
  at: number;
  read: boolean;
}

const KEY = 'blacktop_inbox';
const MAX = 100;
const DB = 'blacktop-inbox';
const STORE = 'pending';
/** The same thing said again within this long replaces the first, not a second line. */
const SAME_MS = 10 * 60 * 1000;

function load(): InboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as InboxItem[]) : [];
    return Array.isArray(list) ? list.filter((i) => i && typeof i.title === 'string') : [];
  } catch {
    return [];
  }
}

let items: InboxItem[] = typeof window !== 'undefined' ? load() : [];
let snapshot = { items, unread: items.filter((i) => !i.read).length };
const listeners = new Set<() => void>();

function commit(next: InboxItem[]) {
  items = next.slice(0, MAX);
  snapshot = { items, unread: items.filter((i) => !i.read).length };
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* full: this session only */
  }
  listeners.forEach((l) => l());
}

/** Something to keep in the inbox. */
export function notify(entry: { kind: InboxKind; title: string; body?: string; url?: string; ref?: string; at?: number }) {
  if (!entry.title) return;
  const at = entry.at ?? Date.now();
  const same = items.find((i) => i.title === entry.title && (i.body ?? '') === (entry.body ?? '') && Math.abs(i.at - at) < SAME_MS);
  const item: InboxItem = { id: same?.id ?? `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: entry.kind, title: entry.title, body: entry.body, url: entry.url, ref: entry.ref, at, read: false };
  commit([item, ...items.filter((i) => i !== same)].sort((a, b) => b.at - a.at));
}

export function markInboxRead() {
  if (!items.some((i) => !i.read)) return;
  commit(items.map((i) => (i.read ? i : { ...i, read: true })));
}

export function removeInboxItem(id: string) {
  commit(items.filter((i) => i.id !== id));
}

export function clearInbox() {
  commit([]);
}

let demoSnap: { items: InboxItem[]; unread: number } | null = null;
export function useInbox(): { items: InboxItem[]; unread: number } {
  const demo = useDemoMode().enabled;
  const real = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
  // Demo mode: the demo's notifications (nothing it does is kept).
  if (!demo) return real;
  if (!demoSnap) {
    const list = demoInbox();
    demoSnap = { items: list, unread: list.filter((i) => !i.read).length };
  }
  return demoSnap;
}

/** What a push is about, from where it leads and its tag (send-push writes both). */
function kindOfPush(url: string, tag: string): InboxKind {
  const s = `${url} ${tag}`.toLowerCase();
  if (s.includes('rescue')) return 'rescue';
  if (s.includes('weather') || s.includes('storm') || s.includes('rain')) return 'weather';
  if (s.includes('crew') || s.includes('challenge') || s.includes('leaderboard')) return 'crew';
  if (s.includes('convoy') || s.includes('lobby')) return 'convoy';
  if (s.includes('garage') || s.includes('service') || s.includes('maint')) return 'service';
  if (s.includes('track')) return 'track';
  if (s.includes('card') || s.includes('world') || s.includes('arcade')) return 'cards';
  if (s.includes('hazard')) return 'hazard';
  return 'general';
}

/** Pushes the worker saved since the app last looked: into the inbox, and out of the worker's store. */
async function drainPushes() {
  if (typeof indexedDB === 'undefined') return;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!db) return;
  try {
    const pending = await new Promise<Array<{ title?: string; body?: string; url?: string; tag?: string; at?: number }>>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const all = store.getAll();
      all.onsuccess = () => {
        store.clear();
        resolve(all.result ?? []);
      };
      all.onerror = () => resolve([]);
    });
    for (const p of pending) {
      if (!p?.title) continue;
      const url = typeof p.url === 'string' && p.url.startsWith('/') ? p.url : undefined;
      notify({ kind: kindOfPush(p.url ?? '', p.tag ?? ''), title: p.title, body: p.body || undefined, url: url && url !== '/' ? url : undefined, at: p.at });
    }
  } finally {
    db.close();
  }
}

let installed = false;
/** Pick up pushes now, whenever the worker says one came in, and whenever the app comes back to the front. */
export function installInbox() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  void drainPushes();
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if ((e.data as { type?: string } | null)?.type === 'bt-push-inbox') void drainPushes();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void drainPushes();
  });
}
