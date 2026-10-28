/**
 * How hilly a ride is, for the flyover: the difference between the highest and
 * lowest ground along it, read from the same free elevation tiles the
 * flyover's terrain uses (AWS Terrain Tiles, Terrarium encoding), at zoom 10
 * (about 150 m a pixel, a handful of tiles for a day's ride). The flyover
 * only turns terrain on where there's relief to show: with terrain on, MapLibre
 * paints the roads onto textures laid over the ground, and on phones the
 * road colours flickered on and off with it, all at once, in the preview and
 * the video alike (2026-10-28). Flat towns looked no different with it, only
 * worse. Null when the tiles can't be read (the flyover then keeps terrain, as
 * it always had).
 */

const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/{x}/{y}.png';
const Z = 10;
const SAMPLES = 80;
const MAX_TILES = 16;

function tileOf(lng: number, lat: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** Z;
  const fx = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.min(255, Math.floor((fx - x) * 256)), py: Math.min(255, Math.floor((fy - y) * 256)) };
}

async function readTile(x: number, y: number, signal: AbortSignal): Promise<Uint8ClampedArray> {
  const res = await fetch(TILE.replace('{x}', String(x)).replace('{y}', String(y)), { signal });
  if (!res.ok) throw new Error(`tile ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return ctx.getImageData(0, 0, 256, 256).data;
}

/** Metres between the highest and lowest ground along the route (lng, lat pairs), or null if unknown. */
export async function routeRelief(coords: [number, number][], timeoutMs = 4000): Promise<number | null> {
  if (coords.length < 2) return null;
  const step = Math.max(1, Math.floor(coords.length / SAMPLES));
  const picks = coords.filter((_, i) => i % step === 0).map(([lng, lat]) => tileOf(lng, lat));
  const keys = [...new Set(picks.map((p) => `${p.x}/${p.y}`))];
  if (keys.length > MAX_TILES) return null;
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const tiles = new Map<string, Uint8ClampedArray>();
    await Promise.all(
      keys.map(async (k) => {
        const [x, y] = k.split('/').map(Number);
        tiles.set(k, await readTile(x, y, ctl.signal));
      }),
    );
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of picks) {
      const d = tiles.get(`${p.x}/${p.y}`);
      if (!d) continue;
      const i = (p.py * 256 + p.px) * 4;
      const metres = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
      if (metres < -500) continue; // the sea's no-data
      lo = Math.min(lo, metres);
      hi = Math.max(hi, metres);
    }
    return Number.isFinite(lo) ? hi - lo : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
