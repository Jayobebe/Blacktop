import { useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { whenStyleReady } from '../lib/whenStyleReady';
import { addWindOverlayLayer, removeWindOverlayLayer, setWindOverlayData, type WindCell } from '../lib/windLayers';

/**
 * The wind layer (Settings → Navigation → Wind on the map, like the rain
 * radar): an arrow every so often across the view, pointing the way the wind
 * blows, bigger and warmer in colour the stronger it is, with its speed. Open-
 * Meteo's current wind for a grid snapped to the view (so panning back reuses
 * what's known), asked as the view changes (at most every 1.5 s) and again every 15 minutes, only
 * while the map is on screen. Lighter while guiding, as the radar is.
 */
const COLS = 5;
const ROWS = 7;
const KEEP_MS = 30 * 60_000;
const REFRESH_MS = 15 * 60_000;
/** At most one look at the view this often: the follow camera moves the map every frame while riding. */
const THROTTLE_MS = 1500;
const OPACITY = 0.85;
const OPACITY_GUIDING = 0.45;
/** The route's own layers: the arrows go under them, as the radar does. */
const ROUTE_LAYERS = new Set(['blacktop-route-casing', 'blacktop-route', 'blacktop-pin-route-casing', 'blacktop-pin-route-line']);

const cache = new Map<string, { at: number; cell: WindCell }>();

function beforeId(map: MapLibreMap): string | undefined {
  for (const l of map.getStyle()?.layers ?? []) if (ROUTE_LAYERS.has(l.id) || l.type === 'symbol') return l.id;
  return undefined;
}

/** The grid for the view: a step that's a round size, so the same view gives the same points. */
function gridFor(map: MapLibreMap): Array<{ lat: number; lng: number; key: string }> {
  const b = map.getBounds();
  const spanLat = b.getNorth() - b.getSouth();
  const spanLng = b.getEast() - b.getWest();
  const nice = (v: number) => {
    const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
    return steps.find((s) => s >= v) ?? 5;
  };
  const stepLat = nice(spanLat / ROWS);
  const stepLng = nice(spanLng / COLS);
  const out: Array<{ lat: number; lng: number; key: string }> = [];
  for (let lat = Math.ceil(b.getSouth() / stepLat) * stepLat; lat < b.getNorth(); lat += stepLat) {
    for (let lng = Math.ceil(b.getWest() / stepLng) * stepLng; lng < b.getEast(); lng += stepLng) {
      // Half a step in: arrows sit between the grid lines, clear of the view's edges.
      const p = { lat: lat + stepLat / 2, lng: lng + stepLng / 2 };
      if (p.lat > b.getNorth() || p.lng > b.getEast()) continue;
      out.push({ ...p, key: `${p.lat.toFixed(3)},${p.lng.toFixed(3)}` });
    }
  }
  return out.slice(0, 60);
}

async function fetchCells(points: Array<{ lat: number; lng: number; key: string }>): Promise<void> {
  const want = points.filter((p) => {
    const c = cache.get(p.key);
    return !c || Date.now() - c.at > KEEP_MS;
  });
  if (!want.length) return;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', want.map((p) => p.lat.toFixed(3)).join(','));
    url.searchParams.set('longitude', want.map((p) => p.lng.toFixed(3)).join(','));
    url.searchParams.set('current', 'wind_speed_10m,wind_gusts_10m,wind_direction_10m');
    url.searchParams.set('wind_speed_unit', 'kmh');
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const json = await res.json();
    const series = Array.isArray(json) ? json : [json];
    want.forEach((p, i) => {
      const c = series[i]?.current;
      const speed = Number(c?.wind_speed_10m);
      const from = Number(c?.wind_direction_10m);
      if (!Number.isFinite(speed) || !Number.isFinite(from)) return;
      const gust = Number(c?.wind_gusts_10m);
      cache.set(p.key, {
        at: Date.now(),
        cell: { lat: p.lat, lng: p.lng, speedKmh: speed, gustKmh: Number.isFinite(gust) ? gust : speed, towards: (from + 180) % 360 },
      });
    });
  } catch {
    /* offline: what's known stays drawn */
  }
}

export function useWindOverlay(map: MapLibreMap | null, enabled: boolean, visible: boolean, guiding: boolean) {
  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      removeWindOverlayLayer(map);
      return;
    }
    if (!visible) return;
    let cancelled = false;
    let throttle = 0;
    let lastKeys = '';
    const draw = () => {
      const points = gridFor(map);
      setWindOverlayData(
        map,
        points.map((p) => cache.get(p.key)?.cell).filter((c): c is WindCell => !!c),
      );
      return points;
    };
    const update = () => {
      if (cancelled) return;
      const points = gridFor(map);
      const keys = points.map((p) => p.key).join('|');
      if (keys === lastKeys && points.every((p) => cache.has(p.key))) return;
      lastKeys = keys;
      draw();
      void fetchCells(points).then(() => {
        if (!cancelled) draw();
      });
    };
    const onMove = () => {
      if (throttle) return;
      throttle = window.setTimeout(() => {
        throttle = 0;
        update();
      }, THROTTLE_MS);
    };
    const cancelReady = whenStyleReady(map, () => {
      addWindOverlayLayer(map, beforeId(map));
      update();
    });
    map.on('moveend', onMove);
    const timer = window.setInterval(() => {
      for (const [k, v] of cache) if (Date.now() - v.at > REFRESH_MS) cache.delete(k);
      lastKeys = '';
      update();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      cancelReady();
      window.clearTimeout(throttle);
      window.clearInterval(timer);
      map.off('moveend', onMove);
    };
  }, [map, enabled, visible]);

  useEffect(() => {
    if (!map || !enabled) return;
    return whenStyleReady(map, () => {
      if (map.getLayer('bt-wind-overlay')) map.setPaintProperty('bt-wind-overlay', 'icon-opacity', guiding ? OPACITY_GUIDING : OPACITY);
    });
  }, [map, enabled, guiding]);
}
