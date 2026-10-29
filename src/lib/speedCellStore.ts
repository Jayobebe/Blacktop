/**
 * The phone's own copy of the shared speed-limit map's cells (lib/speedLimit.ts), so roads ridden
 * before cost nothing: IndexedDB `blacktop_speed_cells`, each cell as it came (the compact file),
 * the most recently used `KEEP` kept. Part of the map cache on the Storage page and cleared with it;
 * Burn deletes the database (lib/burnLocal.ts). Imports nothing.
 */
const DB_NAME = 'blacktop_speed_cells';
const STORE = 'cells';
/** About 400 cells: a few MB at most (a city cell is ~50 KB, a country one ~1 KB). */
const KEEP = 400;

type Rec = { key: string; text: string; size: number; used: number };

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function done(req: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** A cell's file as text, or null. */
export async function readSpeedCell(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const rec = (await done(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as Rec | undefined;
    if (!rec) return null;
    // Mark it used, so the ones ridden often are the ones kept.
    void done(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...rec, used: Date.now() })).catch(() => {});
    return rec.text;
  } catch {
    return null;
  }
}

export async function writeSpeedCell(key: string, text: string): Promise<void> {
  try {
    const db = await openDb();
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ key, text, size: text.length, used: Date.now() } satisfies Rec));
    const all = ((await done(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as Rec[]).sort((a, b) => b.used - a.used);
    if (all.length > KEEP) {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      for (const r of all.slice(KEEP)) store.delete(r.key);
    }
  } catch {
    /* only a cache */
  }
}

/** Bytes kept (for the Storage page). */
export async function speedCellBytes(): Promise<number> {
  try {
    const db = await openDb();
    const all = (await done(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as Rec[];
    return all.reduce((n, r) => n + r.size, 0);
  } catch {
    return 0;
  }
}

export async function clearSpeedCells(): Promise<void> {
  try {
    const db = await openDb();
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
  } catch {
    /* nothing kept */
  }
}
