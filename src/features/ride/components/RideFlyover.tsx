import { isNativeApp } from '@/lib/platform';
import { shareFileNative } from '@/lib/nativeShare';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Play, Pause, Download, Loader2, Rewind, SkipBack, LocateFixed, Move3d } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { loadDarkMapStyle } from '@/features/map';
import { useProfile } from '@/features/profile';
import { formatDistance, formatDuration, formatSpeed, getSpeedLabel } from '@/lib/format';
import { convertWebmToMp4 } from '@/lib/convertToMp4';
import type { RideSession } from '@/types/blacktop';
import { buildFlyoverFrames, memberPositionAt, MemberTrack, FlyoverFrame } from '../lib/flyover';
import { placeAt, placesAlongRide, type RidePlace } from '../lib/rideNames';
import { tr } from '@/lib/i18n';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
// Free, key-less global DEM (Terrarium encoding) hosted by AWS Open Data.
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 30;

const DURATIONS = [10, 15, 30] as const;
/** How fast it plays on screen, and how fast the downloaded video runs (percent of the length chosen). */
const RATES = [0.5, 1, 2, 4] as const;
const VIDEO_SPEEDS = [100, 125, 150, 175, 200] as const;
/** The chase camera: what a download always uses, and where the on-screen camera starts. */
const CHASE = { zoom: 15.6, pitch: 62 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface RideFlyoverProps {
  ride: RideSession;
  onClose: () => void;
}

export function RideFlyover({ ride, onClose }: RideFlyoverProps) {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);
  // Where playback is, in frames (a fraction between two of them), how fast and which way it's going.
  const posRef = useRef(0);
  const rateRef = useRef(1);
  const dirRef = useRef<1 | -1>(1);
  /** A download is always the chase camera, whatever the rider has done with theirs. */
  const chaseRef = useRef(false);
  /** The rider's own camera: locked on the marker (turned and tilted round it) or let go to roam. */
  const camRef = useRef({ lock: true, zoom: CHASE.zoom, pitch: CHASE.pitch, turn: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; angle: number } | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  // The towns along the ride, for the corner: saved on the ride, else looked up now (filling in as they come).
  const placesRef = useRef<RidePlace[]>(ride.places ?? []);
  useEffect(() => {
    let live = true;
    void placesAlongRide(ride, (p) => {
      if (live) placesRef.current = p;
    }).then((p) => {
      if (live && p.length) placesRef.current = p;
    });
    return () => {
      live = false;
    };
  }, [ride]);
  /** The place in the corner and when it last changed (it fades in when it does). */
  const shownPlaceRef = useRef<{ name: string | null; at: number }>({ name: null, at: 0 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const [duration, setDuration] = useState<number>(10);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [reverse, setReverse] = useState(false);
  const [locked, setLocked] = useState(true);
  const [videoSpeed, setVideoSpeed] = useState<number>(100);
  const [recording, setRecording] = useState(false);
  const [convertProgress, setConvertProgress] = useState<number | null>(null);

  const accentColor = useMemo(() => {
    const c = ACCENT_COLORS.find(a => a.id === settings.accentColor) ?? ACCENT_COLORS[0];
    return `hsl(${c.hsl})`;
  }, [settings.accentColor]);

  const memberTracks = useMemo<MemberTrack[]>(
    () => ((ride as RideSession & { memberTracks?: MemberTrack[] }).memberTracks ?? []),
    [ride],
  );

  const frames = useMemo(
    () =>
      buildFlyoverFrames(ride.gpsPoints ?? [], {
        durationSec: duration,
        fps: FPS,
        leanSamples: ride.leanSamples,
        gForceSamples: ride.gForceSamples,
      }),
    [ride, duration],
  );

  const routeCoords = useMemo(
    () => (ride.gpsPoints ?? []).map(p => [p.lng, p.lat] as [number, number]),
    [ride],
  );

  const rideStartTs = ride.gpsPoints?.[0]?.timestamp ?? 0;
  const rideEndTs = ride.gpsPoints?.[ride.gpsPoints.length - 1]?.timestamp ?? 0;

  // ---- Map setup -----------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || routeCoords.length < 2) return;

    // The same dark basemap as the Blacktop map (contrast lifted), so replays match.
    let cancelled = false;
    void loadDarkMapStyle().catch(() => STYLE_URL).then((style) => {
    if (cancelled || !mapContainerRef.current) return;
    const map = new maplibregl.Map({
      pixelRatio: MAP_PIXEL_RATIO,
      container: mapContainerRef.current,
      style,
      center: routeCoords[0],
      zoom: 15.5,
      pitch: 62,
      bearing: 0,
      attributionControl: false,
      interactive: false,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      fadeDuration: 0,
    });
    mapRef.current = map;

    map.on('load', () => {
      try {
        map.addSource('flyover-dem', {
          type: 'raster-dem',
          tiles: [TERRAIN_TILES],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: 14,
          attribution: 'Terrain: AWS Terrain Tiles',
        });
        map.setTerrain({ source: 'flyover-dem', exaggeration: 1.4 });
      } catch (e) {
        console.warn('[Flyover] terrain unavailable', e);
      }

      // 3D buildings from the OpenMapTiles schema the base style already ships.
      try {
        if (map.getSource('openmaptiles') && !map.getLayer('flyover-buildings')) {
          map.addLayer({
            id: 'flyover-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#2b2b31',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          });
        }
      } catch (e) {
        console.warn('[Flyover] buildings unavailable', e);
      }

      map.addSource('flyover-route-full', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } },
      });
      map.addLayer({
        id: 'flyover-route-full',
        type: 'line',
        source: 'flyover-route-full',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.18, 'line-width': 4 },
      });

      map.addSource('flyover-route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [routeCoords[0]] } },
      });
      map.addLayer({
        id: 'flyover-route-glow',
        type: 'line',
        source: 'flyover-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': accentColor, 'line-opacity': 0.35, 'line-width': 14, 'line-blur': 8 },
      });
      map.addLayer({
        id: 'flyover-route-line',
        type: 'line',
        source: 'flyover-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': accentColor, 'line-width': 5 },
      });

      // Paused, nothing redraws the picture by itself: when the map draws again (the camera was moved, or
      // tiles and terrain arrived), copy it across.
      map.on('render', () => {
        if (!rafRef.current) redrawRef.current?.();
      });

      setReady(true);
    });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [routeCoords, accentColor]);

  // ---- Frame compositing ---------------------------------------------------
  const drawStatCard = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      title: string,
      lines: Array<[string, string]>,
      color: string,
    ) => {
      const padding = 12;
      ctx.font = 'bold 16px system-ui';
      let width = ctx.measureText(title).width;
      ctx.font = '14px system-ui';
      for (const [label, value] of lines) {
        width = Math.max(width, ctx.measureText(`${label}  ${value}`).width + 24);
      }
      const boxW = width + padding * 2;
      const boxH = 30 + lines.length * 20 + padding;

      const bx = Math.max(8, Math.min(CANVAS_W - boxW - 8, x - boxW / 2));
      const by = Math.max(8, y - boxH - 26);

      // Leader line down to the pin
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, by + boxH);
      ctx.lineTo(x, y - 10);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(10, 10, 10, 0.82)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 10);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.font = 'bold 16px system-ui';
      ctx.fillText(title, bx + padding, by + padding - 2);

      let ly = by + padding + 20;
      for (const [label, value] of lines) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '13px system-ui';
        ctx.fillText(label, bx + padding, ly);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(value, bx + boxW - padding, ly - 1);
        ctx.textAlign = 'left';
        ly += 20;
      }

      // Rider pin
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [],
  );

  const composite = useCallback(
    (frame: FlyoverFrame) => {
      const map = mapRef.current;
      const canvas = canvasRef.current;
      if (!map || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(map.getCanvas(), 0, 0, CANVAS_W, CANVAS_H);

      // Header — ride name, and the town the rider is in at this moment of the ride.
      const place = placeAt(placesRef.current, frame.elapsed);
      const shown = shownPlaceRef.current;
      if (place !== shown.name) shownPlaceRef.current = { name: place, at: performance.now() };
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(28, 24, 300, place ? 84 : 58, 10);
      ctx.fill();
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '13px system-ui';
      ctx.fillText(tr("RIDE OVERVIEW"), 44, 34);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(ride.name || formatDuration(ride.duration), 44, 52);
      if (place) {
        // A new town fades in over a third of a second.
        const fadeIn = Math.min(1, (performance.now() - shownPlaceRef.current.at) / 350);
        ctx.globalAlpha = fadeIn;
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(50, 87, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '600 16px system-ui';
        ctx.fillText(place, 62, 78, 250);
        ctx.globalAlpha = 1;
      }

      const speedLabel = getSpeedLabel(settings.speedUnit);
      const lines: Array<[string, string]> = [
        ['Speed', `${Math.round(formatSpeed(frame.speed, settings.speedUnit))} ${speedLabel}`],
        ['Dist', formatDistance(frame.distance, settings.distanceUnit)],
        ['Time', formatDuration(Math.round(frame.elapsed))],
      ];
      if (settings.leanAngleEnabled) lines.push(['Lean', `${Math.abs(Math.round(frame.lean))}°`]);
      if (settings.gForceEnabled) lines.push(['G', `${(frame.gForce || 0).toFixed(1)}G`]);

      // Convoy member pins first so the rider card renders on top.
      const ts = rideStartTs + (rideEndTs - rideStartTs) * (frame.elapsed / Math.max(0.001, (rideEndTs - rideStartTs) / 1000));
      for (const track of memberTracks) {
        const pos = memberPositionAt(track, ts);
        if (!pos) continue;
        const pt = map.project([pos.lng, pos.lat]);
        if (pt.x < -100 || pt.x > CANVAS_W + 100 || pt.y < -100 || pt.y > CANVAS_H + 100) continue;
        drawStatCard(ctx, pt.x, pt.y, track.name || 'Rider', [], track.color || '#ffffff');
      }

      const self = map.project([frame.lng, frame.lat]);
      drawStatCard(ctx, self.x, self.y, profile.name.trim() || 'You', lines, accentColor);

      // Progress bar
      const progress = frames.length ? frameIndexRef.current / (frames.length - 1) : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, CANVAS_H - 6, CANVAS_W, 6);
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, CANVAS_H - 6, CANVAS_W * progress, 6);
    },
    [accentColor, drawStatCard, frames.length, memberTracks, profile.name, ride, rideEndTs, rideStartTs, settings],
  );

  const lastRouteIndexRef = useRef(-1);

  const applyFrame = useCallback(
    (frame: FlyoverFrame) => {
      const map = mapRef.current;
      if (!map) return;
      const cam = camRef.current;
      if (chaseRef.current) map.jumpTo({ center: [frame.lng, frame.lat], bearing: frame.bearing, pitch: CHASE.pitch, zoom: CHASE.zoom });
      else if (cam.lock) map.jumpTo({ center: [frame.lng, frame.lat], bearing: frame.bearing + cam.turn, pitch: cam.pitch, zoom: cam.zoom });
      // Let go, the camera stays wherever the rider put it and the marker rides through the view.
      // Route geometry only needs updating when we pass a new GPS vertex —
      // re-uploading it every animation frame is what made playback stutter.
      if (frame.index !== lastRouteIndexRef.current) {
        lastRouteIndexRef.current = frame.index;
        const src = map.getSource('flyover-route') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: routeCoords.slice(0, Math.max(2, frame.index + 2)) },
          });
        }
      }
      composite(frame);
    },
    [composite, routeCoords],
  );

  /** Continuous sample between keyframes so playback isn't locked to 30 steps/s. */
  const frameAt = useCallback(
    (t: number): FlyoverFrame => {
      const i = Math.min(frames.length - 1, Math.floor(t));
      const j = Math.min(frames.length - 1, i + 1);
      const f = t - i;
      const a = frames[i];
      const b = frames[j];
      const mix = (x: number, y: number) => x + (y - x) * f;
      return {
        lat: mix(a.lat, b.lat),
        lng: mix(a.lng, b.lng),
        bearing: mix(a.bearing, b.bearing),
        index: a.index,
        elapsed: mix(a.elapsed, b.elapsed),
        speed: mix(a.speed, b.speed),
        distance: mix(a.distance, b.distance),
        lean: mix(a.lean, b.lean),
        gForce: mix(a.gForce, b.gForce),
      };
    },
    [frames],
  );

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const runLoop = useCallback(
    (onDone?: () => void) => {
      if (!frames.length) return;
      lastRouteIndexRef.current = -1;
      let last = performance.now();
      let lastShown = 0;
      const end = frames.length - 1;
      const tick = (now: number) => {
        const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        const raw = posRef.current + dirRef.current * rateRef.current * FPS * dt;
        const at = clamp(raw, 0, end);
        posRef.current = at;
        frameIndexRef.current = Math.floor(at);
        applyFrame(frameAt(at));
        const done = dirRef.current > 0 ? raw >= end : raw <= 0;
        // The scrubber follows a few times a second, not every frame.
        if (done || now - lastShown > 120) {
          lastShown = now;
          setPos(at);
        }
        if (done) {
          rafRef.current = null;
          setPlaying(false);
          onDone?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [applyFrame, frameAt, frames],
  );

  /** Draw wherever playback is now (after a scrub, or the camera being moved while paused). */
  const redraw = useCallback(() => {
    if (!frames.length) return;
    applyFrame(frameAt(clamp(posRef.current, 0, frames.length - 1)));
  }, [applyFrame, frameAt, frames]);
  redrawRef.current = () => {
    if (frames.length) composite(frameAt(clamp(posRef.current, 0, frames.length - 1)));
  };

  // Draw the first frame as soon as the map is ready (and again from the start when the length changes).
  useEffect(() => {
    if (ready && frames.length) {
      stopLoop();
      setPlaying(false);
      posRef.current = 0;
      frameIndexRef.current = 0;
      lastRouteIndexRef.current = -1;
      setPos(0);
      applyFrame(frames[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, frames]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const play = (dir: 1 | -1) => {
    stopLoop();
    const end = frames.length - 1;
    // Play from the end starts over; rewind at the start has nowhere to go.
    if (dir > 0 && posRef.current >= end) posRef.current = 0;
    if (dir < 0 && posRef.current <= 0) return setPlaying(false);
    dirRef.current = dir;
    setReverse(dir < 0);
    setPlaying(true);
    runLoop();
  };

  const handlePlay = () => {
    if (playing && !reverse) {
      stopLoop();
      setPlaying(false);
      return;
    }
    play(1);
  };

  const handleRewind = () => {
    if (playing && reverse) {
      stopLoop();
      setPlaying(false);
      return;
    }
    play(-1);
  };

  const handleRestart = () => {
    stopLoop();
    setPlaying(false);
    posRef.current = 0;
    frameIndexRef.current = 0;
    setPos(0);
    redraw();
  };

  const handleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
  };

  const handleScrub = (value: number) => {
    stopLoop();
    setPlaying(false);
    posRef.current = value;
    frameIndexRef.current = Math.floor(value);
    setPos(value);
    redraw();
  };

  const handleLock = () => {
    const cam = camRef.current;
    cam.lock = !cam.lock;
    // Letting go keeps the view as it is; locking on again keeps the zoom the rider had.
    const map = mapRef.current;
    if (map) cam.zoom = clamp(map.getZoom(), 10, 18.5);
    if (cam.lock && map) cam.pitch = clamp(map.getPitch(), 0, 78);
    setLocked(cam.lock);
    redraw();
  };

  // ---- The rider's hand on the camera ---------------------------------------
  // The map itself is off screen at the video's size (what's seen is the picture made from it), so the gestures
  // are read here and handed to it: one finger turns and tilts round the marker (or slides the map once let go),
  // two fingers zoom and turn, the wheel zooms.
  const perPixel = () => CANVAS_W / (canvasRef.current?.getBoundingClientRect().width || CANVAS_W);
  const zoomBy = (dz: number) => {
    const cam = camRef.current;
    cam.zoom = clamp(cam.zoom + dz, 10, 18.5);
    if (!cam.lock) mapRef.current?.setZoom(cam.zoom);
  };
  const turnBy = (deg: number) => {
    const cam = camRef.current;
    if (cam.lock) cam.turn += deg;
    else mapRef.current?.setBearing((mapRef.current?.getBearing() ?? 0) + deg);
  };
  const measurePinch = () => {
    const [a, b] = [...pointersRef.current.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (recording || !ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchRef.current = pointersRef.current.size === 2 ? measurePinch() : null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const before = pointersRef.current.get(e.pointerId);
    if (!before || recording) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const k = perPixel();
    const cam = camRef.current;
    if (pointersRef.current.size === 1) {
      const dx = (e.clientX - before.x) * k;
      const dy = (e.clientY - before.y) * k;
      if (cam.lock) {
        cam.turn += dx * 0.25;
        cam.pitch = clamp(cam.pitch - dy * 0.2, 0, 78);
      } else {
        mapRef.current?.panBy([-dx, -dy], { animate: false });
      }
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const now = measurePinch();
      if (pinchRef.current.dist > 0 && now.dist > 0) zoomBy(Math.log2(now.dist / pinchRef.current.dist));
      let twist = now.angle - pinchRef.current.angle;
      if (twist > 180) twist -= 360;
      if (twist < -180) twist += 360;
      turnBy(-twist);
      pinchRef.current = now;
    }
    if (!rafRef.current) redraw();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (recording || !ready) return;
    zoomBy(-e.deltaY * 0.0025);
    if (!rafRef.current) redraw();
  };

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !frames.length || recording) return;

    stopLoop();
    setRecording(true);
    setPlaying(true);
    setReverse(false);
    const rateWas = rateRef.current;
    posRef.current = 0;
    dirRef.current = 1;
    rateRef.current = videoSpeed / 100;
    chaseRef.current = true;

    try {
      const stream = canvas.captureStream(FPS);
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      const blob = await new Promise<Blob | null>(resolve => {
        recordingResolveRef.current = resolve;
        recorder.onstop = () => {
          const b = new Blob(chunksRef.current, { type: 'video/webm' });
          chunksRef.current = [];
          resolve(b);
        };
        recorder.start(250);
        runLoop(() => {
          // Give the recorder a beat to flush the final frames.
          setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop();
          }, 300);
        });
      });

      recorderRef.current = null;
      setPlaying(false);
      if (!blob || blob.size === 0) {
        toast.error(tr("Could not record the flyover"));
        return;
      }

      setConvertProgress(0);
      toast.info(tr("Converting flyover to MP4..."));
      const mp4 = await convertWebmToMp4(blob, p => setConvertProgress(p));

      const base = (ride.name || 'ride').replace(/[/\\?%*:|"<>]/g, '-').trim();
      if (isNativeApp()) {
        await shareFileNative(`${base}-3d-overview.mp4`, mp4);
        return;
      }
      const url = URL.createObjectURL(mp4);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}-3d-overview.mp4`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(tr("3D overview downloaded"));
    } catch (e) {
      console.error('[Flyover] download failed', e);
      toast.error(tr("Failed to render the 3D overview"));
    } finally {
      chaseRef.current = false;
      rateRef.current = rateWas;
      setConvertProgress(null);
      setRecording(false);
      setPlaying(false);
      redraw();
    }
  };

  const hasRoute = routeCoords.length >= 2;

  return (
    <div className="fixed inset-0 z-[100] safe-frame-x bg-black flex flex-col overflow-y-auto overscroll-contain" data-no-pull>
      {/* Offscreen map — the visible frame is the composited canvas below. */}
      <div
        ref={mapContainerRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Clear of the notch / Dynamic Island, and the side notch in landscape. */}
      <div
        className="flex items-center justify-between pb-3 relative z-10"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)', paddingLeft: '1rem', paddingRight: '1rem' }}
      >
        <h2 className="text-sm font-semibold">{tr("3D Ride Overview")}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={tr("Close 3D overview")}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 shrink-0 flex items-center justify-center px-3 relative z-10">
        {hasRoute ? (
          <div className="relative w-full short:max-w-[60vh] short:mx-auto">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full rounded-xl border border-border bg-black touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            />
            <p className="absolute bottom-1 right-2 z-10 text-[9px] text-white/50 pointer-events-none">{tr("Map © OpenStreetMap contributors, OpenFreeMap")}</p>
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />{" "}{tr("Loading terrain…")}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center px-6">
            {tr("This ride doesn't have enough GPS data to build a 3D overview.")}
          </p>
        )}
      </div>

      <div className="p-4 safe-bottom space-y-3 relative z-10">
        {/* Where the replay is: drag to any moment. */}
        <input
          type="range"
          min={0}
          max={Math.max(1, frames.length - 1)}
          step={0.01}
          value={pos}
          onChange={(e) => handleScrub(Number(e.target.value))}
          disabled={!ready || !hasRoute || recording}
          aria-label={tr("Replay position")}
          className="w-full accent-[hsl(var(--accent))] h-6"
        />

        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="icon" className="h-12 w-12 rounded-xl" onClick={handleRestart} disabled={!ready || !hasRoute || recording} aria-label={tr("Back to the start")}>
            <SkipBack className="w-5 h-5" />
          </Button>
          <Button variant={playing && reverse ? 'default' : 'secondary'} size="icon" className="h-12 w-12 rounded-xl" onClick={handleRewind} disabled={!ready || !hasRoute || recording} aria-label={tr("Rewind")} aria-pressed={playing && reverse}>
            <Rewind className="w-5 h-5" />
          </Button>
          <Button className="h-12 flex-1 max-w-[9rem] rounded-xl" onClick={handlePlay} disabled={!ready || !hasRoute || recording}>
            {playing && !reverse ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
            {playing && !reverse ? tr("Pause") : tr("Play")}
          </Button>
          <Button variant="secondary" className="h-12 w-14 rounded-xl font-mono text-sm px-0" onClick={handleRate} disabled={recording} aria-label={tr("Playback speed")}>
            {rate}×
          </Button>
          <Button variant={locked ? 'default' : 'secondary'} size="icon" className="h-12 w-12 rounded-xl" onClick={handleLock} disabled={!ready || !hasRoute || recording} aria-pressed={locked} aria-label={locked ? tr("Let go of the rider and look around") : tr("Lock the camera on the rider")}>
            {locked ? <LocateFixed className="w-5 h-5" /> : <Move3d className="w-5 h-5" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">
          {locked ? tr("Drag to look round the rider, pinch to zoom.") : tr("Drag to move the map, pinch to zoom and turn. Lock on to follow the rider again.")}
        </p>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground">{tr("Length")}</span>
          {DURATIONS.map(d => (
            <button
              key={d}
              disabled={recording}
              onClick={() => setDuration(d)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                duration === d
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {d}{tr("s")}
            </button>
          ))}
        </div>

        {/* The video is always the chase view, whatever the camera above is doing, at the speed picked here. */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">{tr("Video speed")}</span>
          {VIDEO_SPEEDS.map(v => (
            <button
              key={v}
              disabled={recording}
              onClick={() => setVideoSpeed(v)}
              aria-pressed={videoSpeed === v}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs border transition-colors font-mono',
                videoSpeed === v
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {v}%
            </button>
          ))}
        </div>

        <Button
          className="w-full h-12 rounded-xl"
          onClick={handleDownload}
          disabled={!ready || !hasRoute || recording || convertProgress !== null}
        >
          {recording || convertProgress !== null ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {convertProgress !== null
            ? tr("Converting {0}%", [convertProgress])
            : recording
              ? tr("Recording…")
              : tr("Download MP4")}
        </Button>
      </div>
    </div>
  );
}
