import { addProtocol } from 'maplibre-gl';

// Persists downloaded basemap tile bytes in IndexedDB so a recurring/local
// ride re-fetches them from disk instead of over cellular. Same IndexedDB
// pattern as src/lib/overlayStore.ts (open/keyPath/requestToPromise), scoped
// here since it's specific to the map feature's tile loading.
const DB_NAME = 'blacktop_tile_cache';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;
const CACHED_AT_INDEX = 'cachedAt';
const MAX_CACHE_BYTES = 75 * 1024 * 1024; // ~75MB ceiling on cached basemap tiles
const TILE_PROTOCOL = 'blacktop-tile';

interface CachedTile {
  url: string; // keyPath
  data: ArrayBuffer;
  size: number;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex(CACHED_AT_INDEX, 'cachedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedTile(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const record = await requestToPromise<CachedTile | undefined>(tx.objectStore(STORE_NAME).get(url));
    return record?.data ?? null;
  } catch {
    // The cache is a pure optimization - never let it block a tile load.
    return null;
  }
}

let evicting = false;

// Deletes oldest-cached tiles first until total size is back under budget.
async function evictOverBudget(db: IDBDatabase) {
  if (evicting) return;
  evicting = true;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          total += (cursor.value as CachedTile).size;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    if (total <= MAX_CACHE_BYTES) return;

    let overBy = total - MAX_CACHE_BYTES;
    const index = store.index(CACHED_AT_INDEX); // ascending - oldest first
    await new Promise<void>((resolve, reject) => {
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || overBy <= 0) {
          resolve();
          return;
        }
        overBy -= (cursor.value as CachedTile).size;
        cursor.delete();
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  } catch {
    // Best-effort - a failed eviction pass just means we try again next write.
  } finally {
    evicting = false;
  }
}

async function putCachedTile(url: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ url, data, size: data.byteLength, cachedAt: Date.now() } satisfies CachedTile);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    await evictOverBudget(db);
  } catch {
    // Best-effort cache - the tile was already returned to MapLibre either way.
  }
}

let protocolRegistered = false;

/** Registers the `blacktop-tile://` custom protocol once. Call before constructing the Map. */
export function registerTileCacheProtocol() {
  if (protocolRegistered) return;
  protocolRegistered = true;

  addProtocol(TILE_PROTOCOL, async (params, abortController) => {
    const realUrl = params.url.slice(`${TILE_PROTOCOL}://`.length);

    const cached = await getCachedTile(realUrl);
    if (cached) return { data: cached };

    const response = await fetch(realUrl, { signal: abortController.signal });
    if (!response.ok) throw new Error(`Tile request failed (${response.status}): ${realUrl}`);
    const data = await response.arrayBuffer();
    putCachedTile(realUrl, data); // fire-and-forget - don't delay the tile render on the cache write
    return { data };
  });
}

/** Wraps a real tile URL so MapLibre routes it through the cache-backed protocol above. */
export function toCachedTileUrl(url: string): string {
  return `${TILE_PROTOCOL}://${url}`;
}
