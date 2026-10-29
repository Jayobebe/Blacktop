import { fetchWithTimeout, hasOwn, upstreamHeaders, viaGeo } from "../_shared/upstream.ts";

/**
 * Our own weekly extract of cameras and scenic spots (infra/geo/build-spots.sh):
 * one small file per map cell under /spots/<kind>/<row>/<column>.json, rows and
 * columns counted in `size` degrees from the south-west corner of the world. A
 * cell with nothing in it has no file. Null when the server doesn't have the
 * extract (or it can't be read just now): the caller asks Overpass instead.
 */
export const distanceM = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  return Math.hypot(x, (lat2 - lat1) * rad) * 6371000;
};
let spotsCheckedAt = 0;
export async function ownSpots(kind: "cameras" | "scenic", size: number, south: number, west: number, north: number, east: number): Promise<any[] | null> {
  if (!hasOwn("spots")) return null;
  const row = (lat: number) => Math.floor((Math.max(-90, Math.min(89.999, lat)) + 90) / size);
  const col = (lng: number) => Math.floor((Math.max(-180, Math.min(179.999, lng)) + 180) / size);
  // Too wide an area isn't the server's fault: say no without resting it.
  if ((row(north) - row(south) + 1) * (col(east) - col(west) + 1) > 16) return null;
  try {
    return await viaGeo("spots", [], async (base, own, hop) => {
      // A missing cell means "nothing there", so first make sure the extract is there at all (every ten minutes).
      if (Date.now() - spotsCheckedAt > 600_000) {
        const ready = await fetchWithTimeout(`${base}/ready.json`, { hop, headers: upstreamHeaders(own) }, 4000);
        if (!ready.ok) throw new Error(`spots not built: ${ready.status}`);
        await ready.body?.cancel();
        spotsCheckedAt = Date.now();
      }
      const cells: string[] = [];
      for (let r = row(south); r <= row(north); r++) for (let c = col(west); c <= col(east); c++) cells.push(`${base}/${kind}/${r}/${c}.json`);
      const parts = await Promise.all(cells.map(async (url) => {
        const res = await fetchWithTimeout(url, { hop, headers: upstreamHeaders(own) }, 5000);
        if (res.status === 404) {
          await res.body?.cancel();
          return [];
        }
        if (!res.ok) throw new Error(`spots ${res.status}`);
        return (await res.json()) as any[];
      }));
      return parts.flat();
    });
  } catch (e) {
    console.warn("[spots] own extract unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}
