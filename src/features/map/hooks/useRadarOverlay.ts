import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

const TIMELINE_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TIMELINE_REFRESH_MS = 5 * 60 * 1000;
const FRAME_DELAY_MS = 500;
const RADAR_OPACITY = 0.55;
const TILE_SIZE = 256;

interface RadarFrame {
  time: number;
  path: string;
}

interface RadarTimeline {
  host: string;
  radar: { past: RadarFrame[]; nowcast: RadarFrame[] };
}

function sourceIdFor(index: number) {
  return `rainviewer-source-${index}`;
}

function layerIdFor(index: number) {
  return `rainviewer-layer-${index}`;
}

// Mirrors the official rainviewer/rainviewer-api-example MapLibre pattern:
// one source/layer per frame, reused across loops, with opacity crossfades
// (instead of add/remove) so the animation doesn't re-fetch tiles every tick.
export function useRadarOverlay(map: MapLibreMap | null) {
  const frameCountRef = useRef(0);
  const currentIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map) return;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    function clearFrames() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (let i = 0; i < frameCountRef.current; i++) {
        const layerId = layerIdFor(i);
        const sourceId = sourceIdFor(i);
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
      frameCountRef.current = 0;
      currentIndexRef.current = 0;
    }

    function showFrame(index: number) {
      const count = frameCountRef.current;
      if (count === 0) return;
      const nextIndex = ((index % count) + count) % count;
      const prevIndex = currentIndexRef.current;

      if (map.getLayer(layerIdFor(nextIndex))) {
        map.setPaintProperty(layerIdFor(nextIndex), 'raster-opacity', RADAR_OPACITY);
      }
      if (prevIndex !== nextIndex && map.getLayer(layerIdFor(prevIndex))) {
        map.setPaintProperty(layerIdFor(prevIndex), 'raster-opacity', 0);
      }
      currentIndexRef.current = nextIndex;

      timerRef.current = setTimeout(() => showFrame(nextIndex + 1), FRAME_DELAY_MS);
    }

    function loadFrames(timeline: RadarTimeline) {
      clearFrames();
      const frames = [...timeline.radar.past, ...timeline.radar.nowcast];
      if (frames.length === 0) return;

      frames.forEach((frame, index) => {
        const sourceId = sourceIdFor(index);
        const layerId = layerIdFor(index);
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [`${timeline.host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/2/1_1.png`],
          tileSize: TILE_SIZE,
          maxzoom: 7,
        });
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': 0,
            'raster-opacity-transition': { duration: 200, delay: 0 },
            'raster-fade-duration': 0,
          },
        });
      });

      frameCountRef.current = frames.length;
      currentIndexRef.current = 0;
      showFrame(frames.length - 1);
    }

    async function refreshTimeline() {
      try {
        const res = await fetch(TIMELINE_URL);
        if (!res.ok) return;
        const data = (await res.json()) as RadarTimeline;
        if (cancelled) return;
        loadFrames(data);
      } catch {
        // Radar is a non-critical overlay — silently skip on failure.
      }
    }

    if (map.isStyleLoaded()) {
      refreshTimeline();
    } else {
      map.once('load', refreshTimeline);
    }
    refreshTimer = setInterval(refreshTimeline, TIMELINE_REFRESH_MS);

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      clearFrames();
    };
  }, [map]);
}
