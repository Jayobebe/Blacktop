import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Video, VideoOff, X, Download } from 'lucide-react';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LiveStreamViewerProps {
  streamKey: string;
  currentSpeed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
  currentLean?: number;
  maxLean?: number;
  leanThreshold?: number;
  isVisible: boolean;
  isRiding: boolean;
  isPaused: boolean;
  rideEnded: boolean; // New prop to signal ride has fully ended
  onClose: () => void;
  onRecordingComplete?: (recording: {
    blobUrl: string;
    thumbnailUrl: string;
    filename: string;
    duration: number;
    size: number;
  }) => void;
}

export function LiveStreamViewer({
  streamKey,
  currentSpeed,
  maxSpeed,
  distance,
  duration,
  currentLean = 0,
  maxLean = 0,
  leanThreshold = 45,
  isVisible,
  isRiding,
  isPaused,
  rideEnded,
  onClose,
  onRecordingComplete,
}: LiveStreamViewerProps) {
  const { settings } = useSettings();
  const [isConnected, setIsConnected] = useState(false);
  const [broadcasterConnected, setBroadcasterConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastThumbnailRef = useRef<string | null>(null);

  // Format time
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Draw stats overlay on canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Skip overlay if disabled in settings
    if (!settings.showStatsOverlay) return;
    
    // Clear and draw background gradient for overlay area
    const overlayHeight = 80;
    const gradient = ctx.createLinearGradient(0, canvas.height - overlayHeight, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
    
    // Draw stats
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    
    const speedUnit = settings.speedUnit.toUpperCase();
    const distanceUnit = settings.distanceUnit === 'miles' ? 'mi' : 'km';
    
    // Distance (left side)
    ctx.fillText(`${distance.toFixed(1)} ${distanceUnit}`, 20, canvas.height - 25);
    
    // Speed (center, large)
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.round(currentSpeed)} ${speedUnit}`, canvas.width / 2, canvas.height - 25);
    
    // Max speed (smaller, above speed in center)
    ctx.font = '16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText(`MAX ${Math.round(maxSpeed)} ${speedUnit}`, canvas.width / 2, canvas.height - 55);
    
    // Duration (right side)
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatDuration(Math.floor(duration)), canvas.width - 20, canvas.height - 25);
    
    // Lean angle arc (above speed in center, only if enabled)
    if (settings.leanAngleEnabled) {
      const absLean = Math.abs(currentLean);
      const isOverThreshold = absLean >= leanThreshold;
      const ratio = absLean / leanThreshold;

      // Dot color based on lean angle (arc + text stay white)
      const getIndicatorColor = () => {
        if (isOverThreshold) return '#ef4444';
        if (ratio < 0.33) return `hsl(${120 - (ratio / 0.33) * 60}, 85%, 50%)`;
        if (ratio < 0.66) return `hsl(${60 - ((ratio - 0.33) / 0.33) * 30}, 90%, 55%)`;
        return `hsl(${30 - ((ratio - 0.66) / 0.34) * 30}, 85%, 55%)`;
      };

      const indicatorColor = getIndicatorColor();

      // Arc dimensions - lower and simpler (upper semi-circle)
      const arcCenterX = canvas.width / 2;
      const arcCenterY = canvas.height - 40;
      const arcRadius = 52;

      ctx.save();
      // Reset all effects completely
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // White arc (upper semi-circle)
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(arcCenterX, arcCenterY, arcRadius, Math.PI, 0, false);
      ctx.stroke();

      // Indicator position along arc (-60°..+60° mapped left..right)
      const clampedLean = Math.max(-60, Math.min(60, currentLean));
      const indicatorAngle = Math.PI - ((clampedLean + 60) / 120) * Math.PI;
      const indicatorX = arcCenterX + Math.cos(indicatorAngle) * arcRadius;
      const indicatorY = arcCenterY - Math.abs(Math.sin(indicatorAngle)) * arcRadius;

      // Moving dot (colored, no trail)
      ctx.fillStyle = indicatorColor;
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Live lean angle text above arc (flat white, completely separate context)
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillText(`${absLean}°`, arcCenterX, arcCenterY - arcRadius - 10);
      ctx.restore();
    }
    
    // Recording indicator
    if (isRecording) {
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(canvas.width - 20, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('REC', canvas.width - 35, 35);
    }
  }, [currentSpeed, maxSpeed, distance, duration, currentLean, maxLean, leanThreshold, settings.speedUnit, settings.distanceUnit, settings.showStatsOverlay, settings.leanAngleEnabled, isRecording]);

  // Connect to stream relay
  useEffect(() => {
    if (!streamKey || !settings.liveStreamingEnabled || !isVisible) return;
    
    const wsUrl = `wss://xwagsaqsomzrubfpjaad.supabase.co/functions/v1/stream-relay?streamKey=${streamKey}&role=viewer`;
    
    const connect = () => {
      console.log('[LiveStream] Connecting to stream relay...');
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('[LiveStream] Connected to stream relay');
        setIsConnected(true);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'init') {
            setBroadcasterConnected(message.broadcasterConnected);
          } else if (message.type === 'broadcaster_connected') {
            setBroadcasterConnected(true);
            toast.success('Camera connected!');
          } else if (message.type === 'broadcaster_disconnected') {
            setBroadcasterConnected(false);
            toast.info('Camera disconnected');
          } else if (message.type === 'frame') {
            // Handle video frame
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  drawOverlay();
                }
              }
            };
            img.src = message.data;
          }
        } catch (e) {
          // Handle binary frame data
          if (event.data instanceof Blob) {
            const url = URL.createObjectURL(event.data);
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  drawOverlay();
                }
              }
              URL.revokeObjectURL(url);
            };
            img.src = url;
          }
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('[LiveStream] Disconnected from stream relay');
        setIsConnected(false);
        setBroadcasterConnected(false);
        
        // Attempt reconnect after 3 seconds if still visible
        if (isVisible) {
          setTimeout(connect, 3000);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('[LiveStream] WebSocket error:', error);
      };
    };
    
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [streamKey, settings.liveStreamingEnabled, isVisible, drawOverlay]);

  // Redraw overlay when stats change
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Capture thumbnail periodically while recording
  useEffect(() => {
    if (!isRecording || !canvasRef.current) return;
    
    const captureInterval = setInterval(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        // Capture a smaller thumbnail
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 320;
        thumbCanvas.height = 180;
        const ctx = thumbCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, 320, 180);
          lastThumbnailRef.current = thumbCanvas.toDataURL('image/jpeg', 0.7);
        }
      }
    }, 5000); // Capture every 5 seconds
    
    return () => clearInterval(captureInterval);
  }, [isRecording]);

  // Auto-control recording based on ride state
  useEffect(() => {
    // Start recording when ride starts and camera is connected
    if (isRiding && !isPaused && broadcasterConnected && !isRecording) {
      setIsRecording(true);
      if (!recordingStartTime) {
        setRecordingStartTime(Date.now());
      }
      toast.success('Recording started');
    } 
    // Pause recording when ride is paused (but keep chunks)
    else if (isRiding && isPaused && isRecording) {
      setIsRecording(false);
      toast.info('Recording paused');
    }
  }, [isRiding, isPaused, broadcasterConnected, isRecording, recordingStartTime]);

  // Finalize recording only when ride has fully ended
  useEffect(() => {
    if (rideEnded && recordedChunks.length > 0) {
      console.log('[LiveStream] Ride ended, finalizing recording with', recordedChunks.length, 'chunks');
      
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const blobUrl = URL.createObjectURL(blob);
      const recordingDuration = recordingStartTime 
        ? Math.floor((Date.now() - recordingStartTime) / 1000)
        : 0;
      const filename = `blacktop-ride-${new Date().toISOString().split('T')[0]}.webm`;
      
      // Call the callback with recording info
      if (onRecordingComplete) {
        onRecordingComplete({
          blobUrl,
          thumbnailUrl: lastThumbnailRef.current || '',
          filename,
          duration: recordingDuration,
          size: blob.size,
        });
      }
      
      // Clear state
      setRecordedChunks([]);
      setRecordingStartTime(null);
      setIsRecording(false);
    }
  }, [rideEnded, recordedChunks, recordingStartTime, onRecordingComplete]);

  // Handle MediaRecorder lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (isRecording && !mediaRecorderRef.current) {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setRecordedChunks(prev => [...prev, e.data]);
        }
      };
      
      recorder.start(1000); // Capture every second
      mediaRecorderRef.current = recorder;
      
      // Capture initial thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 320;
      thumbCanvas.height = 180;
      const ctx = thumbCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, 320, 180);
        lastThumbnailRef.current = thumbCanvas.toDataURL('image/jpeg', 0.7);
      }
    } else if (!isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [isRecording]);

  // Download recording
  const downloadRecording = () => {
    if (recordedChunks.length === 0) {
      toast.error('No recording available');
      return;
    }
    
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blacktop-ride-${new Date().toISOString().split('T')[0]}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Recording downloaded!');
    setRecordedChunks([]);
  };

  // Toggle between small and fullscreen
  const toggleSize = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!settings.liveStreamingEnabled || !isVisible) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed z-50 bg-black overflow-hidden transition-all duration-300 ease-out",
        isFullscreen 
          ? "inset-0" 
          : "right-3 w-[52vw] h-[22vh] rounded-2xl bottom-[max(0.75rem,env(safe-area-inset-bottom))] landscape:right-0 landscape:bottom-0 landscape:top-0 landscape:w-[40vw] landscape:h-full landscape:rounded-none landscape:rounded-l-2xl"
      )}
      onClick={toggleSize}
    >
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full h-full object-contain"
      />
      
      {/* Connection status overlay */}
      {!broadcasterConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80" onClick={(e) => e.stopPropagation()}>
          {isConnected ? (
            <>
              <VideoOff className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-sm">Waiting for camera...</p>
              <p className="text-muted-foreground text-xs mt-1">Start streaming from your DJI Action 4</p>
            </>
          ) : (
            <>
              <Video className="w-12 h-12 text-muted-foreground mb-4 animate-pulse" />
              <p className="text-muted-foreground text-sm">Connecting to stream...</p>
            </>
          )}
        </div>
      )}
      
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      
      {/* Size hint */}
      <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
        {isFullscreen ? 'Tap to minimize' : 'Tap to expand'}
      </div>
      
      {/* Recording status & controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Recording status indicator */}
        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/80 text-white text-xs">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            REC
          </div>
        )}
        {isPaused && recordedChunks.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-warning/80 text-black text-xs">
            PAUSED
          </div>
        )}
        
        {/* Download button - show when we have recorded content */}
        {recordedChunks.length > 0 && !isRiding && (
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadRecording}
            className="h-9 text-xs gap-1.5"
          >
            <Download className="w-4 h-4" />
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

// Floating toggle button component
interface StreamToggleButtonProps {
  onClick: () => void;
  isStreamActive: boolean;
}

export function StreamToggleButton({ onClick, isStreamActive }: StreamToggleButtonProps) {
  const { settings } = useSettings();
  
  if (!settings.liveStreamingEnabled) {
    return null;
  }
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-20 right-3 z-40 p-3 rounded-full shadow-lg transition-all",
        "bg-card/90 border border-border/50 backdrop-blur-sm",
        "hover:scale-105 active:scale-95",
        isStreamActive && "bg-accent text-accent-foreground"
      )}
    >
      <Video className="w-5 h-5" />
    </button>
  );
}
