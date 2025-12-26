import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, X, Film, Loader2 } from 'lucide-react';
import { RideSession } from '@/types/blacktop';
import { formatDuration, formatDistance } from '@/lib/format';
import { toast } from 'sonner';

interface OverlayExporterProps {
  ride: RideSession;
  speedUnit: 'mph' | 'kph';
  distanceUnit: 'miles' | 'km';
  onClose: () => void;
}

export function OverlayExporter({ ride, speedUnit, distanceUnit, onClose }: OverlayExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const speedLabel = speedUnit.toUpperCase();
  const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';

  // Get stats at a specific point in the ride (0-1 progress)
  const getStatsAtProgress = useCallback((p: number) => {
    const clampedP = Math.max(0, Math.min(1, p));
    const pointIndex = Math.floor(clampedP * (ride.gpsPoints.length - 1));
    const point = ride.gpsPoints[Math.min(pointIndex, ride.gpsPoints.length - 1)];
    
    // Calculate running max speed up to this point
    let runningMaxSpeed = 0;
    let runningMaxLeanLeft = 0;
    let runningMaxLeanRight = 0;
    
    for (let i = 0; i <= pointIndex; i++) {
      const pt = ride.gpsPoints[i];
      if (pt.speed > runningMaxSpeed) runningMaxSpeed = pt.speed;
      if (pt.leanAngle !== undefined) {
        if (pt.leanAngle < 0) {
          runningMaxLeanLeft = Math.max(runningMaxLeanLeft, Math.abs(pt.leanAngle));
        } else {
          runningMaxLeanRight = Math.max(runningMaxLeanRight, pt.leanAngle);
        }
      }
    }

    // Also check lean samples if available
    if (ride.leanSamples && ride.leanSamples.length > 0) {
      const rideStartMs = new Date(ride.startedAt).getTime();
      const targetMs = rideStartMs + (clampedP * ride.duration * 1000);
      
      for (const sample of ride.leanSamples) {
        if (sample.timestamp <= targetMs) {
          if (sample.angle < 0) {
            runningMaxLeanLeft = Math.max(runningMaxLeanLeft, Math.abs(sample.angle));
          } else {
            runningMaxLeanRight = Math.max(runningMaxLeanRight, sample.angle);
          }
        }
      }
    }

    return {
      speed: point?.speed || 0,
      distance: ride.distance * clampedP,
      duration: Math.floor(ride.duration * clampedP),
      maxSpeed: runningMaxSpeed,
      maxLean: Math.max(runningMaxLeanLeft, runningMaxLeanRight),
      leanAngle: point?.leanAngle || 0,
    };
  }, [ride]);

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, stats: ReturnType<typeof getStatsAtProgress>) => {
    // Clear with transparency
    ctx.clearRect(0, 0, width, height);

    // Semi-transparent panels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

    // Top left panel - Max Speed
    ctx.beginPath();
    ctx.roundRect(40, 30, 180, 70, 8);
    ctx.fill();

    // Top right panel - Max Lean (if exists)
    if (stats.maxLean > 0) {
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

    // Top Left - Max Speed (running max)
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

    // Top Right - Max Lean (running max)
    if (stats.maxLean > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('MAX LEAN', width - 55, 45);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(`${Math.round(stats.maxLean)}°`, width - 55, 65);
      ctx.textAlign = 'left';
    }

    // Bottom Left - Distance (cumulative)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(formatDistance(stats.distance, distanceUnit), 40, height - 50);
    ctx.font = '16px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(distLabel, 140, height - 45);

    // Bottom Center - Live Speed
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px system-ui';
    ctx.fillText('SPEED', width / 2, height - 70);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${Math.round(stats.speed)}`, width / 2, height - 55);
    ctx.font = '14px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(speedLabel, width / 2, height - 25);

    // Bottom Right - Duration (elapsed)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(formatDuration(stats.duration), width - 40, height - 50);
  }, [speedLabel, distLabel, distanceUnit]);

  const exportOverlay = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsExporting(true);
    setProgress(0);

    try {
      // Set up canvas for 1080p
      canvas.width = 1920;
      canvas.height = 1080;

      // Create MediaRecorder with VP9 for transparency support
      const stream = canvas.captureStream(30);
      
      // Try VP9 with alpha for transparency, fall back to VP8
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000, // 8 Mbps for quality
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
      });

      recorder.start();

      // Render frames at 30fps for the ride duration
      const fps = 30;
      const totalFrames = Math.ceil(ride.duration * fps);
      const frameInterval = 1000 / fps;

      for (let frame = 0; frame <= totalFrames; frame++) {
        const p = frame / totalFrames;
        const stats = getStatsAtProgress(p);
        drawFrame(ctx, canvas.width, canvas.height, stats);

        setProgress(Math.round((frame / totalFrames) * 100));

        // Wait for next frame timing
        await new Promise((r) => setTimeout(r, frameInterval / 10)); // Speed up export
      }

      recorder.stop();
      const blob = await recordingPromise;

      // Download the video
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ride.name || 'ride'}-overlay.webm`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Overlay video exported! Import as a layer in your video editor.');
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export overlay');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-md w-full p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">Export Animated Overlay</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info */}
        <div className="bg-accent/10 rounded-lg p-3 border border-accent/20">
          <p className="text-sm text-muted-foreground">
            This will generate a transparent WebM video ({formatDuration(ride.duration)} long) with animated stats that match your ride data. Import it as an overlay layer in your video editor.
          </p>
        </div>

        {/* Preview canvas (hidden but used for rendering) */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Progress */}
        {isExporting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rendering frames...</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isExporting} className="flex-1">
            Cancel
          </Button>
          <Button onClick={exportOverlay} disabled={isExporting} className="flex-1 gap-2">
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Video
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}