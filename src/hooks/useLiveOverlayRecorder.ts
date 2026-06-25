import { useRef, useCallback, useEffect } from 'react';
import { formatDuration, formatDistance } from '@/lib/format';
import { buildGForcePoints, pointsToAreaPath, pointsToLinePath } from '@/lib/gForceGraph';

interface OverlayStats {
  speed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
  leanAngle: number;
  maxLean: number;
  gForce: number;
  maxGForce: number;
}

interface LiveOverlayRecorderOptions {
  speedUnit: 'mph' | 'kph';
  distanceUnit: 'miles' | 'km';
  hasLeanData: boolean;
  hasGForceData: boolean;
  /** Literal CSS color (e.g. 'hsl(38, 95%, 55%)') - canvas can't resolve `hsl(var(--accent))`. */
  accentColor: string;
}

// Rolling window for the G-force trace: enough to show recent shape on a
// small sparkline without the per-frame path math growing unbounded over a long ride.
const GFORCE_HISTORY_MAX_POINTS = 150;

export function useLiveOverlayRecorder(options: LiveOverlayRecorderOptions) {
  const { speedUnit, distanceUnit, hasLeanData, hasGForceData, accentColor } = options;
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
  });
  const gForceHistoryRef = useRef<number[]>([]);

  // Use refs for these so the animation loop always has the latest value
  const hasLeanDataRef = useRef(hasLeanData);
  hasLeanDataRef.current = hasLeanData;
  const hasGForceDataRef = useRef(hasGForceData);
  hasGForceDataRef.current = hasGForceData;
  const accentColorRef = useRef(accentColor);
  accentColorRef.current = accentColor;

  const speedLabel = speedUnit.toUpperCase();
  const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';

  // Draw a single frame to the canvas
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, stats: OverlayStats, showLean: boolean, showGForce: boolean, gForceHistory: number[], accent: string) => {
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

    // Bottom Left - Distance
    ctx.fillStyle = 'white';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(formatDistance(stats.distance, distanceUnit), 40, height - 50);
    ctx.font = '16px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(distLabel, 140, height - 45);

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

      // Draw the arc
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, arcCenterY, arcRadius, arcStartAngle, arcEndAngle);
      ctx.stroke();

      // Calculate dot position based on lean angle
      const maxLeanAngle = 45;
      const clampedLean = Math.max(-maxLeanAngle, Math.min(maxLeanAngle, stats.leanAngle));
      const leanProgress = (clampedLean + maxLeanAngle) / (2 * maxLeanAngle);
      const dotAngle = arcStartAngle + leanProgress * (arcEndAngle - arcStartAngle);

      const dotX = centerX + Math.cos(dotAngle) * arcRadius;
      const dotY = arcCenterY + Math.sin(dotAngle) * arcRadius;

      // Draw the dot
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Live lean angle above the speed but below the arc
      const leanTextY = arcCenterY - arcRadius + 20;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${Math.abs(Math.round(stats.leanAngle))}°`, centerX, leanTextY);
    }

    // Bottom area, between the speed/lean arc (center) and the Duration
    // readout (bottom right) - its own slot, not behind/overlapping either.
    if (showGForce && gForceHistory.length > 1) {
      const graphWidth = 220;
      const graphHeight = 60;
      const graphCenterX = width * 0.72;
      const graphX = graphCenterX - graphWidth / 2;
      const graphY = height - 110;
      const points = buildGForcePoints(gForceHistory, graphWidth, graphHeight);

      ctx.save();
      ctx.translate(graphX, graphY);

      const areaPath = new Path2D(pointsToAreaPath(points, graphHeight));
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      ctx.fill(areaPath);

      const linePath = new Path2D(pointsToLinePath(points));
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(linePath);

      ctx.restore();
    }

    // Bottom Right - Duration
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
        gForceHistoryRef.current,
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
