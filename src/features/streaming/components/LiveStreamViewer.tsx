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
  isVisible: boolean;
  onClose: () => void;
}

export function LiveStreamViewer({
  streamKey,
  currentSpeed,
  maxSpeed,
  distance,
  duration,
  isVisible,
  onClose,
}: LiveStreamViewerProps) {
  const { settings } = useSettings();
  const [isConnected, setIsConnected] = useState(false);
  const [broadcasterConnected, setBroadcasterConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
          : "bottom-0 right-0 left-0 h-[45vh] rounded-t-2xl landscape:left-auto landscape:top-0 landscape:bottom-0 landscape:w-[40vw] landscape:h-full landscape:rounded-t-none landscape:rounded-l-2xl"
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
      
      {/* Recording controls */}
      <div className="absolute bottom-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {recordedChunks.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadRecording}
            className="bg-black/50 hover:bg-black/70 text-white h-9 w-9"
          >
            <Download className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          onClick={() => setIsRecording(!isRecording)}
          className="h-9 text-xs"
        >
          {isRecording ? 'Stop Rec' : 'Record'}
        </Button>
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
