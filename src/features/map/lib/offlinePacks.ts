import { cacheTilePinned, deleteCachedTiles } from './tileCache';

// Offline map packs: an explicit "download this area for offline" on top of the
// opportunistic tile cache. A pack is a bbox + zoom range; its tile URLs are
// fetched once and pinned so eviction can't reclaim them, and deleting the pack
// removes exactly those tiles.

export interface PackBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface OfflinePack {
  id: string;
  name: string;
  bounds: PackBounds;
  minZoom: number;
  maxZoom: number;
  tileUrls: string[];
  bytes: number;
  createdAt: string;
}

const PACKS_KEY = 'bt.map.offlinePacks.v1';

// Zoom span for a downloaded area: z10 gives regional context, z15 is enough
// detail to navigate a street. Going deeper explodes the tile count.
export const PACK_MIN_ZOOM = 10;
export const PACK_MAX_ZOOM = 15;

// Rough per-tile averages measured against OpenFreeMap vector + Esri raster.
const AVG_TILE_BYTES = 22 * 1024;
export const MAX_PACK_TILES = 4000;

function lngToX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Enumerates {z,x,y} tiles covering the bounds across the zoom range. */
export function tilesForBounds(
  bounds: PackBounds,
  minZoom = PACK_MIN_ZOOM,
  maxZoom = PACK_MAX_ZOOM,
): { z: number; x: number; y: number }[] {
  const out: { z: number; x: number; y: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lngToX(bounds.west, z);
    const x1 = lngToX(bounds.east, z);
    const y0 = latToY(bounds.north, z);
    const y1 = latToY(bounds.south, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        out.push({ z, x, y });
      }
    }
    if (out.length > MAX_PACK_TILES * 4) return out; // bail early on absurd areas
  }
  return out;
}

/** Expands `{z}/{x}/{y}` templates into concrete tile URLs. */
export function expandTemplates(
  templates: string[],
  tiles: { z: number; x: number; y: number }[],
): string[] {
  const urls: string[] = [];
  for (const t of tiles) {
    for (const tpl of templates) {
      urls.push(
        tpl
          .replace('{z}', String(t.z))
          .replace('{x}', String(t.x))
          .replace('{y}', String(t.y)),
      );
    }
  }
  return urls;
}

export interface PackEstimate {
  tileCount: number;
  bytes: number;
  tooLarge: boolean;
}

export function estimatePack(
  bounds: PackBounds,
  templates: string[],
  minZoom = PACK_MIN_ZOOM,
  maxZoom = PACK_MAX_ZOOM,
): PackEstimate {
  const tiles = tilesForBounds(bounds, minZoom, maxZoom);
  const tileCount = tiles.length * Math.max(1, templates.length);
  return {
    tileCount,
    bytes: tileCount * AVG_TILE_BYTES,
    tooLarge: tileCount > MAX_PACK_TILES,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 50 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function listPacks(): OfflinePack[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as OfflinePack[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePacks(packs: OfflinePack[]) {
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
  } catch {
    // Storage full — the tiles are still cached, we just lose the manifest.
  }
}

export async function deletePack(id: string): Promise<void> {
  const packs = listPacks();
  const pack = packs.find((p) => p.id === id);
  if (pack) await deleteCachedTiles(pack.tileUrls);
  writePacks(packs.filter((p) => p.id !== id));
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
}

/**
 * Downloads and pins every tile in the bounds, then records the pack.
 * Progress is reported per tile so the UI can show a bar; failures are skipped
 * rather than aborting the whole pack.
 */
export async function downloadPack(opts: {
  name: string;
  bounds: PackBounds;
  templates: string[];
  minZoom?: number;
  maxZoom?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<OfflinePack | null> {
  const minZoom = opts.minZoom ?? PACK_MIN_ZOOM;
  const maxZoom = opts.maxZoom ?? PACK_MAX_ZOOM;
  const urls = expandTemplates(opts.templates, tilesForBounds(opts.bounds, minZoom, maxZoom));
  if (urls.length === 0 || urls.length > MAX_PACK_TILES) return null;

  let bytes = 0;
  const stored: string[] = [];
  const CONCURRENCY = 6;
  let cursor = 0;

  const worker = async () => {
    while (cursor < urls.length) {
      if (opts.signal?.aborted) return;
      const url = urls[cursor++];
      const written = await cacheTilePinned(url, opts.signal);
      bytes += written;
      stored.push(url);
      opts.onProgress?.({ done: stored.length, total: urls.length, bytes });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (opts.signal?.aborted) {
    await deleteCachedTiles(stored);
    return null;
  }

  const pack: OfflinePack = {
    id: `pack_${Date.now().toString(36)}`,
    name: opts.name,
    bounds: opts.bounds,
    minZoom,
    maxZoom,
    tileUrls: stored,
    bytes,
    createdAt: new Date().toISOString(),
  };
  writePacks([pack, ...listPacks()]);
  return pack;
}
