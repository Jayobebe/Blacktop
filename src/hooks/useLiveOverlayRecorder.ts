import { useRef, useCallback, useEffect } from 'react';
import { drawMiniMap } from '@/lib/overlayMiniMap';
import { drawOverlayFrame, MINI_MAP_SIZE, OVERLAY_SIZE, TRANSPARENT_OVERLAY_TYPE, type OverlayBackground, type OverlayShape, type OverlayStats } from '@/lib/overlayFrame';
import { speedUnitText } from '@/lib/units';
import { tr } from '@/lib/i18n';

interface LiveOverlayRecorderOptions {
  speedUnit: 'mph' | 'kph';
  distanceUnit: 'miles' | 'km';
  hasLeanData: boolean;
  hasGForceData: boolean;
  /** Literal CSS color (e.g. 'hsl(38, 95%, 55%)') - canvas can't resolve `hsl(var(--accent))`. */
  accentColor: string;
  /** When true, draw a live mini-map (bottom-left) with rider + route. */
  blacktopMapEnabled: boolean;
  /** Landscape 16:9 or vertical 9:16 (Settings → Ride Overlay). */
  shape?: OverlayShape;
  /** Transparent, or a green screen to key out / black to blend (Settings → Ride Overlay). */
  background?: OverlayBackground;
  /**
   * Convoy voice-channel audio source. When provided, every stream returned is
   * mixed into the recording's audio track (own mic + remote riders). Omitted
   * for solo rides or when voice recording is disabled in settings.
   */
  getVoiceStreams?: () => MediaStream[];
}

export function useLiveOverlayRecorder(options: LiveOverlayRecorderOptions) {
  const { speedUnit, distanceUnit, hasLeanData, hasGForceData, accentColor, blacktopMapEnabled, getVoiceStreams, shape = 'landscape', background = 'transparent' } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Voice mixing: one AudioContext + destination feeding the recorder, with a
  // poller that attaches peers that join mid-ride.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixedStreamIdsRef = useRef<Set<string>>(new Set());
  const voicePollRef = useRef<number | null>(null);
  const getVoiceStreamsRef = useRef(getVoiceStreams);
  getVoiceStreamsRef.current = getVoiceStreams;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const latestStatsRef = useRef<OverlayStats>({
    speed: 0,
    maxSpeed: 0,
    distance: 0,
    duration: 0,
    leanAngle: 0,
    maxLean: 0,
    gForce: 0,
    maxGForce: 0,
    lat: null,
    lng: null,
    heading: null,
  });
  // Rider trail for the mini-map polyline. Down-sampled from live GPS points
  // to a bounded ring so a multi-hour ride doesn't grow unbounded memory.
  const routeRef = useRef<Array<{ lat: number; lng: number }>>([]);
  // The real-map mini map (lib/overlayMiniMapGL), created on the first fix of a
  // recording; the old tile renderer draws until it has a frame.
  const glMiniMapRef = useRef<import('@/lib/overlayMiniMapGL').OverlayMiniMapGL | null>(null);
  const glMiniMapPendingRef = useRef(false);

  // Use refs for these so the animation loop always has the latest value
  const hasLeanDataRef = useRef(hasLeanData);
  hasLeanDataRef.current = hasLeanData;
  const hasGForceDataRef = useRef(hasGForceData);
  hasGForceDataRef.current = hasGForceData;
  const accentColorRef = useRef(accentColor);
  accentColorRef.current = accentColor;
  const blacktopMapEnabledRef = useRef(blacktopMapEnabled);
  blacktopMapEnabledRef.current = blacktopMapEnabled;
  const lookRef = useRef({ speedUnit, distanceUnit, shape, background });
  lookRef.current = { speedUnit, distanceUnit, shape, background };
  // The shape and background of the clip being recorded: fixed when it starts.
  const recordingShapeRef = useRef<OverlayShape>(shape);
  const recordingBackgroundRef = useRef<OverlayBackground>(background);


  // Draw a single frame (lib/overlayFrame), with the mini map painted by the
  // real-map dial once it has a frame, the tile renderer until then.
  const paintMiniMap = useCallback((ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
    const stats = latestStatsRef.current;
    if (stats.lat == null || stats.lng == null) return false;
    const gl = glMiniMapRef.current;
    if (gl?.hasFrame) {
      gl.draw(ctx, cx, cy, size, stats.heading);
      return true;
    }
    drawMiniMap({
      ctx,
      region: { x: cx - size / 2, y: cy - size / 2, width: size, height: size, radius: size / 2 },
      center: { lat: stats.lat, lng: stats.lng, heading: stats.heading },
      route: routeRef.current,
      members: stats.members,
      opacity: 1,
      accent: accentColorRef.current,
    });
    return true;
  }, []);

  // Animation loop to continuously draw frames, no faster than the 30fps the
  // stream captures (rAF runs at 60Hz+, and every extra 1080p frame is wasted).
  const lastDrawRef = useRef(0);
  const animate = useCallback((now: number = performance.now()) => {
    if (!isRecordingRef.current || !canvasRef.current) return;

    const ctx = now - lastDrawRef.current >= 1000 / 31 ? canvasRef.current.getContext('2d') : null;
    if (ctx) {
      lastDrawRef.current = now;
      const look = lookRef.current;
      drawOverlayFrame(
        ctx,
        latestStatsRef.current,
        {
          shape: recordingShapeRef.current,
          background: recordingBackgroundRef.current,
          accent: accentColorRef.current,
          speedUnit: speedUnitText(look.speedUnit).toUpperCase(),
          distanceUnit: (look.distanceUnit === 'km' ? tr("km") : tr("mi")).toUpperCase(),
          distanceIn: look.distanceUnit,
          showLean: hasLeanDataRef.current,
          showGForce: hasGForceDataRef.current,
          showMiniMap: blacktopMapEnabledRef.current,
          now: new Date(),
        },
        paintMiniMap,
      );
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [paintMiniMap]);

  // Start recording
  const startRecording = useCallback(() => {
    // Create an offscreen canvas
    const canvas = document.createElement('canvas');
    recordingShapeRef.current = lookRef.current.shape;
    recordingBackgroundRef.current = lookRef.current.background;
    const { width, height } = OVERLAY_SIZE[recordingShapeRef.current];
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;

    // Clear the chunks
    chunksRef.current = [];
    routeRef.current = [];

    // Get stream from canvas
    const stream = canvas.captureStream(30); // 30 fps

    // Mix the convoy voice channel in (when enabled) so the exported clip has
    // the crew's conversation as its audio track.
    if (getVoiceStreamsRef.current) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();
        audioCtxRef.current = ctx;
        audioDestRef.current = dest;
        mixedStreamIdsRef.current = new Set();

        const attachStreams = () => {
          const sources = getVoiceStreamsRef.current?.() ?? [];
          sources.forEach((src) => {
            if (!src || src.getAudioTracks().length === 0) return;
            if (mixedStreamIdsRef.current.has(src.id)) return;
            try {
              ctx.createMediaStreamSource(src).connect(dest);
              mixedStreamIdsRef.current.add(src.id);
            } catch (e) {
              console.warn('[OverlayRecorder] Failed to mix voice stream', e);
            }
          });
        };

        attachStreams();
        voicePollRef.current = window.setInterval(attachStreams, 3000);
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch (e) {
        console.warn('[OverlayRecorder] Voice recording unavailable', e);
      }
    }

    // VP9, else VP8: both keep the frame's transparency (checked: see-through and
    // half see-through pixels come back as drawn). An MP4 can't, so a transparent
    // recording is downloaded as this WebM and never converted.
    const hasAudio = stream.getAudioTracks().length > 0;
    let mimeType = hasAudio ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = hasAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8000000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorderRef.current = recorder;
    isRecordingRef.current = true;

    // Start recording with timeslice for regular data collection
    recorder.start(1000); // Collect data every second

    // Start animation loop
    animate();

    console.log('[OverlayRecorder] Started recording');
  }, [animate]);

  // Update stats (call this frequently during the ride)
  const updateStats = useCallback((stats: OverlayStats) => {
    latestStatsRef.current = stats;

    // Append to the mini-map trail if we're rendering it. Skip near-duplicate
    // fixes so a stationary rider doesn't inflate the buffer.
    if (blacktopMapEnabledRef.current && stats.lat != null && stats.lng != null) {
      const trail = routeRef.current;
      const last = trail[trail.length - 1];
      if (!last || Math.abs(last.lat - stats.lat) > 1e-5 || Math.abs(last.lng - stats.lng) > 1e-5) {
        trail.push({ lat: stats.lat, lng: stats.lng });
        if (trail.length > 2000) trail.splice(0, trail.length - 2000);
      }
      const gl = glMiniMapRef.current;
      if (gl) {
        gl.update({ lat: stats.lat, lng: stats.lng, heading: stats.heading }, trail, stats.members);
      } else if (isRecordingRef.current && !glMiniMapPendingRef.current) {
        // MapLibre loads only now, for riders recording with the mini map on.
        glMiniMapPendingRef.current = true;
        const at = { lat: stats.lat, lng: stats.lng };
        import('@/lib/overlayMiniMapGL')
          .then(({ OverlayMiniMapGL }) => OverlayMiniMapGL.create(MINI_MAP_SIZE, accentColorRef.current, at))
          .then((mm) => {
            if (isRecordingRef.current) glMiniMapRef.current = mm;
            else mm.destroy();
          })
          .catch((e) => console.warn('[OverlayRecorder] Map mini map unavailable, using tiles:', e))
          .finally(() => {
            glMiniMapPendingRef.current = false;
          });
      }
    }
  }, []);


  // Stop recording and return the blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || !isRecordingRef.current) {
        resolve(null);
        return;
      }

      isRecordingRef.current = false;
      glMiniMapRef.current?.destroy();
      glMiniMapRef.current = null;

      // Stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const recorder = recorderRef.current;

      if (voicePollRef.current) {
        clearInterval(voicePollRef.current);
        voicePollRef.current = null;
      }
      mixedStreamIdsRef.current.clear();
      audioDestRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recordingBackgroundRef.current === 'transparent' ? TRANSPARENT_OVERLAY_TYPE : 'video/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        canvasRef.current = null;
        console.log('[OverlayRecorder] Stopped recording, size:', blob.size);
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      glMiniMapRef.current?.destroy();
      glMiniMapRef.current = null;
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      }
      if (voicePollRef.current) {
        clearInterval(voicePollRef.current);
        voicePollRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  return {
    startRecording,
    stopRecording,
    updateStats,
    isRecording: isRecordingRef.current,
  };
}
