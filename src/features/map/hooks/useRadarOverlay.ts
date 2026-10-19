import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { App } from '@capacitor/app';
import { whenStyleReady } from '../lib/whenStyleReady';

const TIMELINE_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TIMELINE_REFRESH_MS = 5 * 60 * 1000; // throttle window: at most one timeline fetch per 5 minutes
const FRAME_DELAY_MS = 500; // 500ms per frame for animation
/**
 * How strong the rain is drawn: noticeable on the map, and lighter while
 * guiding, so the road and the route stay the first thing the eye finds.
 */
const RADAR_OPACITY = 0.45;
const RADAR_OPACITY_GUIDING = 0.28;
/** The route's own layers: rain goes under them, as it goes under the labels and pins. */
const ROUTE_LAYERS = new Set(['blacktop-route-casing', 'blacktop-route', 'blacktop-pin-route-casing', 'blacktop-pin-route-line']);

/** The first layer the rain should sit under: the route, or the first label / pin layer, whichever is lowest. */
function radarBeforeId(map: MapLibreMap): string | undefined {
  for (const l of map.getStyle()?.layers ?? []) {
    if (ROUTE_LAYERS.has(l.id) || l.type === 'symbol') return l.id;
  }
  return undefined;
}
const TILE_SIZE = 256;
const STATIONARY_PAUSE_MS = 2 * 60 * 1000; // freeze animation after 2 minutes with no speed
const STATIONARY_CHECK_INTERVAL_MS = 5000;

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

// Module-level (not per-hook-instance) cache so closing/reopening the map
// overlay - which fully unmounts/remounts this hook and its MapLibre
// instance - can't bypass the 5-minute throttle by just re-mounting.
let cachedTimeline: RadarTimeline | null = null;
let lastFetchedAt = 0;
let inFlightFetch: Promise<RadarTimeline | null> | null = null;

async function fetchTimelineThrottled(): Promise<RadarTimeline | null> {
  const now = Date.now();
  if (cachedTimeline && now - lastFetchedAt < TIMELINE_REFRESH_MS) {
    return cachedTimeline;
  }
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const res = await fetch(TIMELINE_URL);
      if (!res.ok) return cachedTimeline; // keep whatever we had on a bad response
      const data = (await res.json()) as RadarTimeline;
      cachedTimeline = data;
      lastFetchedAt = Date.now();
      return data;
    } catch {
      // Radar is a non-critical overlay - silently fall back to the stale cache.
      return cachedTimeline;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

// Mirrors the official rainviewer/rainviewer-api-example MapLibre pattern:
// one source/layer per frame, reused across loops, with opacity crossfades
// (instead of add/remove) so the animation doesn't re-fetch tiles every tick.
//
// Resource guards on top of that base pattern:
// - Timeline JSON is throttled to one real fetch per 5 minutes app-wide (see
//   fetchTimelineThrottled above), not just per mount.
// - The frame-cycling loop freezes on the single latest frame (no further
//   layer/opacity churn) while the app is backgrounded, the vehicle has been
//   stationary for 2+ minutes - each of those otherwise causes layers to fade
//   in/out for frames nobody is looking at. (It plays on while the map moves.)
export function useRadarOverlay(
  mapOrNull: MapLibreMap | null,
  currentSpeedMph: number,
  enabled = true,
  guiding = false,
) {
  const opacityRef = useRef(RADAR_OPACITY);
  opacityRef.current = guiding ? RADAR_OPACITY_GUIDING : RADAR_OPACITY;
  const frameCountRef = useRef(0);
  const currentIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSpeedRef = useRef(currentSpeedMph);
  currentSpeedRef.current = currentSpeedMph;

  useEffect(() => {
    if (!mapOrNull || !enabled) return;
    // Non-null for the functions below (TypeScript doesn't carry the check into them).
    const map: MapLibreMap = mapOrNull;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let stationaryCheckTimer: ReturnType<typeof setInterval> | null = null;
    let appStateHandle: { remove: () => void } | undefined;
    let stationarySince: number | null = null;

    // Combined freeze state: animate only while none of these are true.
    const pauseFlags = { background: false, stationary: false };
    let isFrozen = false;

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
        map.setPaintProperty(layerIdFor(nextIndex), 'raster-opacity', opacityRef.current);
      }
      if (prevIndex !== nextIndex && map.getLayer(layerIdFor(prevIndex))) {
        map.setPaintProperty(layerIdFor(prevIndex), 'raster-opacity', 0);
      }
      currentIndexRef.current = nextIndex;

      timerRef.current = setTimeout(() => showFrame(nextIndex + 1), FRAME_DELAY_MS);
    }

    // Stop cycling and show only the single most recent frame, statically.
    function freezeOnLatestFrame() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const count = frameCountRef.current;
      if (count === 0) return;
      const latest = count - 1;
      for (let i = 0; i < count; i++) {
        if (map.getLayer(layerIdFor(i))) {
          map.setPaintProperty(layerIdFor(i), 'raster-opacity', i === latest ? opacityRef.current : 0);
        }
      }
      currentIndexRef.current = latest;
    }

    function resumeAnimation() {
      if (frameCountRef.current === 0 || timerRef.current) return;
      showFrame(currentIndexRef.current);
    }

    function recomputeFrozenState() {
      const shouldFreeze = pauseFlags.background || pauseFlags.stationary;
      if (shouldFreeze === isFrozen) return;
      isFrozen = shouldFreeze;
      if (isFrozen) {
        freezeOnLatestFrame();
      } else {
        resumeAnimation();
      }
    }

    function setPauseFlag(key: keyof typeof pauseFlags, value: boolean) {
      if (pauseFlags[key] === value) return;
      pauseFlags[key] = value;
      recomputeFrozenState();
    }

    // Starts the loop, or - if we're already in a freeze condition (e.g. a
    // periodic timeline refresh lands while the app is backgrounded) - jumps
    // straight to the static latest-frame fallback instead of animating.
    function startOrFreeze() {
      currentIndexRef.current = frameCountRef.current - 1;
      if (isFrozen) {
        freezeOnLatestFrame();
      } else {
        showFrame(frameCountRef.current - 1);
      }
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
        map.addLayer(
          {
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': 0,
              'raster-opacity-transition': { duration: 200, delay: 0 },
              'raster-fade-duration': 0,
            },
          },
          radarBeforeId(map),
        );
      });

      frameCountRef.current = frames.length;
      startOrFreeze();
    }

    async function refreshTimeline() {
      const data = await fetchTimelineThrottled();
      if (cancelled || !data) return;
      whenStyleReady(map, () => {
        if (!cancelled) loadFrames(data);
      });
    }

    // Frames are added once the style can take them (see whenStyleReady) —
    // 'load' may have fired long before the radar was switched on.
    refreshTimeline();
    // Re-check every 5 minutes; fetchTimelineThrottled() is a no-op network-wise
    // if a fetch already happened that recently (e.g. via another mount).
    refreshTimer = setInterval(refreshTimeline, TIMELINE_REFRESH_MS);

    // --- Guard 2: pause while backgrounded or stationary 2+ minutes ---
    App.addListener('appStateChange', ({ isActive }) => {
      setPauseFlag('background', !isActive);
    }).then((handle) => {
      if (cancelled) {
        handle.remove();
        return;
      }
      appStateHandle = handle;
    });

    stationaryCheckTimer = setInterval(() => {
      if (currentSpeedRef.current > 0) {
        stationarySince = null;
        setPauseFlag('stationary', false);
        return;
      }
      if (stationarySince === null) {
        stationarySince = Date.now();
        return;
      }
      if (Date.now() - stationarySince >= STATIONARY_PAUSE_MS) {
        setPauseFlag('stationary', true);
      }
    }, STATIONARY_CHECK_INTERVAL_MS);

    // No pause while the map moves: the radar used to freeze mid-pan, and the
    // follow camera moving after every fix kept it frozen for most of a guided
    // ride. Its tiles are coarse (zoom 7 at most) and every frame's layer loads
    // them either way, so playing on costs little.

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (stationaryCheckTimer) clearInterval(stationaryCheckTimer);
      appStateHandle?.remove();
      clearFrames();
    };
  }, [mapOrNull, enabled]);

  // Guiding on or off: the frame on screen takes the new strength straight away.
  useEffect(() => {
    const map = mapOrNull;
    if (!map || !enabled) return;
    const id = layerIdFor(currentIndexRef.current);
    try {
      if (map.getLayer(id) && (map.getPaintProperty(id, 'raster-opacity') as number) > 0) {
        map.setPaintProperty(id, 'raster-opacity', opacityRef.current);
      }
    } catch {
      /* style not ready: the next frame shown uses the new strength */
    }
  }, [mapOrNull, enabled, guiding]);
}
