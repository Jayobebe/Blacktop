import { fetchWithTimeout, hasOwn, upstreamHeaders, viaGeo } from "../_shared/upstream.ts";

/**
 * Our own server's cells service (infra/geo/osmcells): the roads with their speed limits and the
 * places the quick searches look for, cut weekly out of its OpenStreetMap download, answered in
 * Overpass's shape (`{ elements }`), so it stands in for Overpass with nothing else changed. Null
 * when the server doesn't run it, can't be reached just now, or the spot is outside the area it was
 * built for (404 "outside", which isn't a fault and doesn't rest it): the caller asks Overpass.
 */
export async function ownCells(path: "roads" | "places", params: Record<string, string | number | boolean>): Promise<{ elements: any[] } | null> {
  if (!hasOwn("cells")) return null;
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  try {
    return await viaGeo("cells", [], async (base, own, hop) => {
      const res = await fetchWithTimeout(`${base}/${path}?${query}`, { hop, headers: upstreamHeaders(own) }, 6000);
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) throw new Error(`cells ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.elements) ? json : null;
    }, { hedge: false });
  } catch (e) {
    console.warn("[cells] own server unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}
