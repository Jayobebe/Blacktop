import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Runs `fn` as soon as the map can accept sources and layers.
 *
 * Don't gate on `map.isStyleLoaded()` + `map.once('load')`: isStyleLoaded() is
 * false whenever any tile is still loading (constantly, mid-ride), while 'load'
 * only fires once when the map first opens — so anything added later waited
 * forever (e.g. no route line after searching during a ride). Adding sources and
 * layers only needs the style itself parsed, so try immediately and, only if the
 * style really isn't ready yet, retry on the next 'styledata'.
 *
 * Returns a cancel function for effect cleanups.
 */
export function whenStyleReady(map: MapLibreMap, fn: () => void): () => void {
  let cancelled = false;
  const attempt = () => {
    if (cancelled) return;
    try {
      fn();
    } catch (err) {
      if (/not done loading/i.test(String((err as Error)?.message ?? err))) {
        map.once('styledata', attempt);
        return;
      }
      throw err;
    }
  };
  attempt();
  return () => {
    cancelled = true;
    map.off('styledata', attempt);
  };
}
