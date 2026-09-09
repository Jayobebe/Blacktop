import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Play, Pause, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { formatDistance, formatDuration, formatSpeed, getSpeedLabel } from '@/lib/format';
import { convertWebmToMp4 } from '@/lib/convertToMp4';
import type { RideSession } from '@/types/blacktop';
import { buildFlyoverFrames, memberPositionAt, MemberTrack, FlyoverFrame } from '../lib/flyover';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
// Free, key-less global DEM (Terrarium encoding) hosted by AWS Open Data.
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 30;

const DURATIONS = [10, 15, 30] as const;

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
  const startedAtRef = useRef<number>(0);
  const frameIndexRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const [duration, setDuration] = useState<number>(10);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLE_URL,
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

      setReady(true);
    });

    return () => {
      map.remove();
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

      // Header — ride name + compressed-time badge
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(28, 24, 300, 58, 10);
      ctx.fill();
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '13px system-ui';
      ctx.fillText('RIDE OVERVIEW', 44, 34);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(ride.name || formatDuration(ride.duration), 44, 52);

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
      map.jumpTo({ center: [frame.lng, frame.lat], bearing: frame.bearing, pitch: 62, zoom: 15.6 });
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
      startedAtRef.current = performance.now();
      lastRouteIndexRef.current = -1;
      const tick = () => {
        const elapsed = (performance.now() - startedAtRef.current) / 1000;
        const pos = Math.min(frames.length - 1, elapsed * FPS);
        const idx = Math.floor(pos);
        frameIndexRef.current = idx;
        applyFrame(frameAt(pos));
        if (idx >= frames.length - 1) {
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

  // Draw the first frame as soon as the map is ready.
  useEffect(() => {
    if (ready && frames.length) {
      frameIndexRef.current = 0;
      applyFrame(frames[0]);
    }
  }, [ready, frames, applyFrame]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const handlePlay = () => {
    if (playing) {
      stopLoop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    runLoop();
  };

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !frames.length || recording) return;

    stopLoop();
    setRecording(true);
    setPlaying(true);

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
        toast.error('Could not record the flyover');
        return;
      }

      setConvertProgress(0);
      toast.info('Converting flyover to MP4...');
      const mp4 = await convertWebmToMp4(blob, p => setConvertProgress(p));

      const base = (ride.name || 'ride').replace(/[/\\?%*:|"<>]/g, '-').trim();
      const url = URL.createObjectURL(mp4);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}-3d-overview.mp4`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('3D overview downloaded');
    } catch (e) {
      console.error('[Flyover] download failed', e);
      toast.error('Failed to render the 3D overview');
    } finally {
      setConvertProgress(null);
      setRecording(false);
      setPlaying(false);
    }
  };

  const hasRoute = routeCoords.length >= 2;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
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

      <div className="flex items-center justify-between px-4 py-3 relative z-10">
        <h2 className="text-sm font-semibold">3D Ride Overview</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close 3D overview">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center px-3 relative z-10">
        {hasRoute ? (
          <div className="relative w-full">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full rounded-xl border border-border bg-black"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading terrain…
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center px-6">
            This ride doesn't have enough GPS data to build a 3D overview.
          </p>
        )}
      </div>

      <div className="p-4 space-y-3 relative z-10">
        <div className="flex items-center justify-center gap-2">
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
              {d}s
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handlePlay}
            disabled={!ready || !hasRoute || recording}
          >
            {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleDownload}
            disabled={!ready || !hasRoute || recording || convertProgress !== null}
          >
            {recording || convertProgress !== null ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {convertProgress !== null
              ? `Converting ${convertProgress}%`
              : recording
                ? 'Recording…'
                : 'Download MP4'}
          </Button>
        </div>
      </div>
    </div>
  );
}
