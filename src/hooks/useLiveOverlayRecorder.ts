import { useRef, useCallback, useEffect } from 'react';
import { formatDuration, formatDistance } from '@/lib/format';
import { buildGForcePoints, pointsToAreaPath, pointsToLinePath } from '@/lib/gForceGraph';
import { drawMiniMap } from '@/lib/overlayMiniMap';

interface OverlayStats {
  speed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
  leanAngle: number;
  maxLean: number;
  gForce: number;
  maxGForce: number;
  // Live rider position + heading so the mini-map (when enabled) can centre
  // the map on the rider and rotate to their direction of travel.
  lat: number | null;
  lng: number | null;
  heading: number | null;
}

interface LiveOverlayRecorderOptions {
  speedUnit: 'mph' | 'kph';
  distanceUnit: 'miles' | 'km';
  hasLeanData: boolean;
  hasGForceData: boolean;
  /** Literal CSS color (e.g. 'hsl(38, 95%, 55%)') - canvas can't resolve `hsl(var(--accent))`. */
  accentColor: string;
  /** When true, draw a live mini-map (bottom-right) with rider + route. */
  blacktopMapEnabled: boolean;
}

// Rolling window for the G-force trace: enough to show recent shape on a
// small sparkline without the per-frame path math growing unbounded over a long ride.
const GFORCE_HISTORY_MAX_POINTS = 150;

export function useLiveOverlayRecorder(options: LiveOverlayRecorderOptions) {
  const { speedUnit, distanceUnit, hasLeanData, hasGForceData, accentColor, blacktopMapEnabled } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const gForceHistoryRef = useRef<number[]>([]);
  // Rider trail for the mini-map polyline. Down-sampled from live GPS points
  // to a bounded ring so a multi-hour ride doesn't grow unbounded memory.
  const routeRef = useRef<Array<{ lat: number; lng: number }>>([]);

  // Use refs for these so the animation loop always has the latest value
  const hasLeanDataRef = useRef(hasLeanData);
  hasLeanDataRef.current = hasLeanData;
  const hasGForceDataRef = useRef(hasGForceData);
  hasGForceDataRef.current = hasGForceData;
  const accentColorRef = useRef(accentColor);
  accentColorRef.current = accentColor;
  const blacktopMapEnabledRef = useRef(blacktopMapEnabled);
  blacktopMapEnabledRef.current = blacktopMapEnabled;

  const speedLabel = speedUnit.toUpperCase();
  const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';


  // Draw a single frame to the canvas
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, stats: OverlayStats, showLean: boolean, showGForce: boolean, showMiniMap: boolean, gForceHistory: number[], route: Array<{ lat: number; lng: number }>, accent: string) => {
    // Clear with transparency
    ctx.clearRect(0, 0, width, height);

    // Semi-transparent panels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

    // Top left panel - Max Speed
    ctx.beginPath();
    ctx.roundRect(40, 30, 180, 70, 8);
    ctx.fill();

    // Top right panel - Max Lean (only if ride has lean data)
    if (showLean) {
      ctx.beginPath();
      ctx.roundRect(width - 220, 30, 180, 70, 8);
      ctx.fill();
    }

    // Bottom gradient bar
    const gradient = ctx.createLinearGradient(0, height - 120, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height - 120, width, 120);

    // Text styles
    ctx.textBaseline = 'top';

    // Top Left - Max Speed
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('MAX SPEED', 55, 45);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(`${Math.round(stats.maxSpeed)}`, 55, 65);
    ctx.font = '16px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(speedLabel, 130, 72);

    // Top Right - Max Lean (only if ride has lean data)
    if (showLean) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('MAX LEAN', width - 55, 45);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(`${Math.round(stats.maxLean)}°`, width - 55, 65);
      ctx.textAlign = 'left';
    }

    // Bottom Left — Mini-map (when Blacktop Maps is enabled) with the
    // Distance readout sitting just above it. Otherwise just the Distance.
    const showLeftMiniMap = showMiniMap && stats.lat != null && stats.lng != null;
    if (showLeftMiniMap) {
      const mmWidth = 360;
      const mmHeight = 300;
      const mmX = 40;
      const mmY = height - mmHeight - 40;

      // Distance label above the mini-map
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(formatDistance(stats.distance, distanceUnit), mmX, mmY - 34);
      ctx.font = '14px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const distText = formatDistance(stats.distance, distanceUnit);
      const distWidth = ctx.measureText(distText).width;
      ctx.fillText(distLabel, mmX + distWidth + 90, mmY - 28);

      drawMiniMap({
        ctx,
        region: { x: mmX, y: mmY, width: mmWidth, height: mmHeight, radius: 18 },
        center: { lat: stats.lat, lng: stats.lng, heading: stats.heading },
        route,
        opacity: 0.6,
        accent,
      });
    } else {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(formatDistance(stats.distance, distanceUnit), 40, height - 50);
      ctx.font = '16px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(distLabel, 140, height - 45);
    }

    // Bottom Center - Live Speed with Lean Arc
    const centerX = width / 2;

    // Speed label
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px system-ui';
    ctx.fillText('SPEED', centerX, height - 70);

    // Speed value
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${Math.round(stats.speed)}`, centerX, height - 55);
    ctx.font = '14px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(speedLabel, centerX, height - 25);

    // Lean Arc (only if ride has lean data)
    if (showLean) {
      const arcRadius = 85;
      const arcCenterY = height - 40;
      const arcStartAngle = Math.PI * 1.15;
      const arcEndAngle = Math.PI * 1.85;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, arcCenterY, arcRadius, arcStartAngle, arcEndAngle);
      ctx.stroke();

      const maxLeanAngle = 45;
      const clampedLean = Math.max(-maxLeanAngle, Math.min(maxLeanAngle, stats.leanAngle));
      const leanProgress = (clampedLean + maxLeanAngle) / (2 * maxLeanAngle);
      const dotAngle = arcStartAngle + leanProgress * (arcEndAngle - arcStartAngle);

      const dotX = centerX + Math.cos(dotAngle) * arcRadius;
      const dotY = arcCenterY + Math.sin(dotAngle) * arcRadius;

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
      ctx.fill();

      const leanTextY = arcCenterY - arcRadius + 20;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${Math.abs(Math.round(stats.leanAngle))}°`, centerX, leanTextY);
    }

    // Bottom Right — G-force gauge, styled to match the in-app GForceGauge:
    // 270° sweep dial starting bottom-left → bottom-right, colored by threshold.
    if (showGForce) {
      const GAUGE_MAX_G = 3;
      const WARN_G = 1.8;
      const DANGER_G = 2.4;
      const currentG = Math.max(0, stats.gForce || 0);
      const maxG = Math.max(0, stats.maxGForce || 0);
      const clamped = Math.min(GAUGE_MAX_G, currentG);
      const fraction = clamped / GAUGE_MAX_G;

      const gaugeRadius = 60;
      const strokeW = 12;
      const cxG = width - 40 - gaugeRadius - 4;
      const cyG = height - 130 - gaugeRadius;

      const startAngle = (-225 * Math.PI) / 180;
      const endAngle = startAngle + (270 * Math.PI) / 180;
      const valueEndAngle = startAngle + fraction * (270 * Math.PI) / 180;

      const isDanger = currentG >= DANGER_G;
      const isWarn = !isDanger && currentG >= WARN_G;
      const activeColor = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : accent;
      const textColor = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : 'white';

      // Track
      ctx.beginPath();
      ctx.arc(cxG, cyG, gaugeRadius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Value arc
      if (fraction > 0) {
        ctx.beginPath();
        ctx.arc(cxG, cyG, gaugeRadius, startAngle, valueEndAngle);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = strokeW;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Center value
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = textColor;
      ctx.font = 'bold 28px monospace';
      ctx.fillText(currentG.toFixed(1), cxG, cyG - 6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '12px system-ui';
      ctx.fillText('G', cxG, cyG + 16);

      // MAX label below the gauge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '13px system-ui';
      ctx.fillText(`MAX ${maxG > 0 ? maxG.toFixed(1) : '0.0'}G`, cxG, cyG + gaugeRadius + 14);

      ctx.textBaseline = 'top';
    }

    // Bottom Right — Duration readout (always visible on the right now).
    ctx.textAlign = 'right';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(formatDuration(stats.duration), width - 40, height - 50);
  }, [speedLabel, distLabel, distanceUnit]);

  // Animation loop to continuously draw frames
  const animate = useCallback(() => {
    if (!isRecordingRef.current || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      drawFrame(
        ctx,
        canvasRef.current.width,
        canvasRef.current.height,
        latestStatsRef.current,
        hasLeanDataRef.current,
        hasGForceDataRef.current,
        blacktopMapEnabledRef.current,
        gForceHistoryRef.current,
        routeRef.current,
        accentColorRef.current,
      );
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [drawFrame]);

  // Start recording
  const startRecording = useCallback(() => {
    // Create an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    canvasRef.current = canvas;

    // Clear the chunks
    chunksRef.current = [];
    gForceHistoryRef.current = [];
    routeRef.current = [];

    // Get stream from canvas
    const stream = canvas.captureStream(30); // 30 fps

    // Try VP9 for transparency, fall back to VP8
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
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

    if (hasGForceDataRef.current) {
      const history = gForceHistoryRef.current;
      history.push(stats.gForce);
      if (history.length > GFORCE_HISTORY_MAX_POINTS) {
        history.splice(0, history.length - GFORCE_HISTORY_MAX_POINTS);
      }
    }

    // Append to the mini-map trail if we're rendering it. Skip near-duplicate
    // fixes so a stationary rider doesn't inflate the buffer.
    if (blacktopMapEnabledRef.current && stats.lat != null && stats.lng != null) {
      const trail = routeRef.current;
      const last = trail[trail.length - 1];
      if (!last || Math.abs(last.lat - stats.lat) > 1e-5 || Math.abs(last.lng - stats.lng) > 1e-5) {
        trail.push({ lat: stats.lat, lng: stats.lng });
        if (trail.length > 2000) trail.splice(0, trail.length - 2000);
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

      // Stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const recorder = recorderRef.current;

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
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
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
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
