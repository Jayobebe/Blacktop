import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Video, VideoOff, Maximize2, Minimize2, Download } from 'lucide-react';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LiveStreamViewerProps {
  streamKey: string;
  currentSpeed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
  isRecording?: boolean;
  onRecordingChange?: (recording: boolean) => void;
}

export function LiveStreamViewer({
  streamKey,
  currentSpeed,
  maxSpeed,
  distance,
  duration,
  isRecording = false,
  onRecordingChange,
}: LiveStreamViewerProps) {
  const { settings } = useSettings();
  const [isConnected, setIsConnected] = useState(false);
  const [broadcasterConnected, setBroadcasterConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Format time
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
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
    
    // Speed (large, left side)
    ctx.fillText(`${Math.round(currentSpeed)} ${speedUnit}`, 20, canvas.height - 25);
    
    // Max speed (smaller, next to speed)
    ctx.font = '16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText(`MAX ${Math.round(maxSpeed)} ${speedUnit}`, 20, canvas.height - 55);
    
    // Distance (center)
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${distance.toFixed(1)} ${distanceUnit}`, canvas.width / 2, canvas.height - 25);
    
    // Duration (right side)
    ctx.textAlign = 'right';
    ctx.fillText(formatDuration(Math.floor(duration)), canvas.width - 20, canvas.height - 25);
    
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
  }, [currentSpeed, maxSpeed, distance, duration, settings.speedUnit, settings.distanceUnit, isRecording]);

  // Connect to stream relay
  useEffect(() => {
    if (!streamKey || !settings.liveStreamingEnabled) return;
    
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
        
        // Attempt reconnect after 3 seconds
        setTimeout(connect, 3000);
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
  }, [streamKey, settings.liveStreamingEnabled, drawOverlay]);

  // Redraw overlay when stats change
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Handle recording
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

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!settings.liveStreamingEnabled) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-xl overflow-hidden bg-black border border-border/30",
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : "aspect-video"
      )}
    >
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full h-full object-contain"
      />
      
      {/* Connection status overlay */}
      {!broadcasterConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
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
      
      {/* Controls */}
      <div className="absolute top-2 right-2 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
        
        {recordedChunks.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadRecording}
            className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      {/* Recording controls */}
      <div className="absolute bottom-2 right-2">
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          onClick={() => onRecordingChange?.(!isRecording)}
          className="h-8 text-xs"
        >
          {isRecording ? 'Stop Recording' : 'Record'}
        </Button>
      </div>
    </div>
  );
}
