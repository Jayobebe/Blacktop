import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { App } from '@capacitor/app';

const TIMELINE_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TIMELINE_REFRESH_MS = 5 * 60 * 1000; // throttle window: at most one timeline fetch per 5 minutes
const FRAME_DELAY_MS = 500; // 500ms per frame for animation
const RADAR_OPACITY = 0.55;
const TILE_SIZE = 256;
const STATIONARY_PAUSE_MS = 2 * 60 * 1000; // freeze animation after 2 minutes with no speed
const STATIONARY_CHECK_INTERVAL_MS = 5000;
const PAN_ZOOM_SETTLE_MS = 400; // let MapLibre settle on the final viewport before resuming the loop

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
//   stationary for 2+ minutes, or the map is actively being panned/zoomed -
//   each of those otherwise causes layers to fade in/out and MapLibre to
//   request tiles for frames or viewports nobody is looking at.
export function useRadarOverlay(
  map: MapLibreMap | null,
  currentSpeedMph: number,
  enabled = true,
) {
  const frameCountRef = useRef(0);
  const currentIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSpeedRef = useRef(currentSpeedMph);
  currentSpeedRef.current = currentSpeedMph;

  useEffect(() => {
    if (!map) return;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let stationaryCheckTimer: ReturnType<typeof setInterval> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let appStateHandle: { remove: () => void } | undefined;
    let stationarySince: number | null = null;

    // Combined freeze state: animate only while none of these are true.
    const pauseFlags = { background: false, stationary: false, settling: false };
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
        map.setPaintProperty(layerIdFor(nextIndex), 'raster-opacity', RADAR_OPACITY);
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
          map.setPaintProperty(layerIdFor(i), 'raster-opacity', i === latest ? RADAR_OPACITY : 0);
        }
      }
      currentIndexRef.current = latest;
    }

    function resumeAnimation() {
      if (frameCountRef.current === 0 || timerRef.current) return;
      showFrame(currentIndexRef.current);
    }

    function recomputeFrozenState() {
      const shouldFreeze = pauseFlags.background || pauseFlags.stationary || pauseFlags.settling;
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
      startOrFreeze();
    }

    async function refreshTimeline() {
      const data = await fetchTimelineThrottled();
      if (cancelled || !data) return;
      loadFrames(data);
    }

    if (map.isStyleLoaded()) {
      refreshTimeline();
    } else {
      map.once('load', refreshTimeline);
    }
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

    // --- Guard 3: debounce pan/zoom so the loop resumes only once the
    // viewport has settled, instead of fading layers in/out (and prompting
    // MapLibre to fetch tiles) mid-gesture. `move`/`moveend` cover zoom too. ---
    function handleMoveStart() {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      setPauseFlag('settling', true);
    }
    function handleMoveEnd() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        setPauseFlag('settling', false);
      }, PAN_ZOOM_SETTLE_MS);
    }
    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (stationaryCheckTimer) clearInterval(stationaryCheckTimer);
      if (settleTimer) clearTimeout(settleTimer);
      appStateHandle?.remove();
      map.off('movestart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      clearFrames();
    };
  }, [map]);
}
