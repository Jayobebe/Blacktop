import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { applyMapLook, nightLookFor, type MapLook } from '../lib/mapLook';
import { whenStyleReady } from '../lib/whenStyleReady';

/** How often an "after sunset" night map checks whether the sun has set or risen. */
const CHECK_MS = 60_000;

/**
 * Keeps a map in the rider's map look with the night look on top after
 * sunset (map/lib/mapLook), switching as the sun sets and rises where the map
 * is. Checks only while `active` (a hidden map does nothing), and picks up
 * basemap layers added later (3D buildings). Returns the look on now, for the
 * map's own cards (dimmed at night) and CRT's scanlines to follow.
 */
export function useMapLook(map: MapLibreMap | null, active = true): MapLook {
  const { settings } = useSettings();
  const { mapLook, nightMapEnabled, nightMapStyle, nightMapWhen } = settings;
  const [look, setLook] = useState<MapLook>({ day: mapLook, night: null });

  useEffect(() => {
    if (!map || !active) return;
    const s = { nightMapEnabled, nightMapStyle, nightMapWhen };
    let now: MapLook = { day: mapLook, night: null };
    let cancelReady = () => {};
    const check = () => {
      let at: { lat: number; lng: number } | null = null;
      try {
        const c = map.getCenter();
        at = { lat: c.lat, lng: c.lng };
      } catch {
        /* removed map */
      }
      const next: MapLook = { day: mapLook, night: nightLookFor(s, at) };
      now = next;
      setLook((was) => (was.day === next.day && was.night === next.night ? was : next));
      cancelReady();
      cancelReady = whenStyleReady(map, () => applyMapLook(map, next));
    };
    check();
    const timer = nightMapEnabled && nightMapWhen === 'auto' ? window.setInterval(check, CHECK_MS) : 0;
    // A basemap layer added later (3D buildings) takes the look too; only what differs is set, so this settles.
    let frame = 0;
    const onStyle = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          applyMapLook(map, now);
        } catch {
          /* style mid-change: the next styledata tries again */
        }
      });
    };
    map.on('styledata', onStyle);
    return () => {
      cancelReady();
      if (timer) window.clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      map.off('styledata', onStyle);
    };
  }, [map, active, mapLook, nightMapEnabled, nightMapStyle, nightMapWhen]);

  return active ? look : { day: mapLook, night: null };
}
