import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Video, Play, Download, X, Clock, AlertCircle, Check } from 'lucide-react';
import { RideSession, GpsPoint } from '@/types/blacktop';
import { useSettings } from '@/features/settings';
import { formatDuration, formatDistance, formatSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VideoOverlayProcessorProps {
  ride: RideSession;
  onClose?: () => void;
}

type ProcessingStage = 'idle' | 'loading-ffmpeg' | 'processing' | 'complete' | 'error';

export function VideoOverlayProcessor({ ride, onClose }: VideoOverlayProcessorProps) {
  const { settings } = useSettings();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [syncOffset, setSyncOffset] = useState<number>(0); // seconds offset between video start and ride start
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<any>(null);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [videoUrl, outputUrl]);

  // Get ride stats at a specific timestamp
  const getStatsAtTime = useCallback((videoTimeSeconds: number): { speed: number; distance: number; duration: number } => {
    // Video time + sync offset = ride time from start
    const rideTimeMs = (videoTimeSeconds + syncOffset) * 1000;
    const rideStartMs = new Date(ride.startedAt).getTime();
    const targetTimestamp = rideStartMs + rideTimeMs;
    
    // Find the closest GPS point
    let closestPoint: GpsPoint | null = null;
    let minDiff = Infinity;
    let accumulatedDistance = 0;
    
    for (let i = 0; i < ride.gpsPoints.length; i++) {
      const point = ride.gpsPoints[i];
      const diff = Math.abs(point.timestamp - targetTimestamp);
      
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
        
        // Calculate distance up to this point
        if (i > 0) {
          // Sum distances from GPS points (approximation)
          accumulatedDistance = (i / ride.gpsPoints.length) * ride.distance;
        }
      }
    }
    
    const durationAtPoint = Math.max(0, Math.floor(rideTimeMs / 1000));
    
    return {
      speed: closestPoint?.speed ?? 0,
      distance: accumulatedDistance,
      duration: durationAtPoint,
    };
  }, [ride, syncOffset]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    
    // Clean up previous URL
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setOutputUrl(null);
    setStage('idle');
    setProgress(0);
    setErrorMessage(null);
  };

  const handleVideoLoad = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const processVideo = async () => {
    if (!videoFile || !videoUrl) return;
    
    setStage('loading-ffmpeg');
    setProgress(0);
    setErrorMessage(null);
    
    try {
      // Dynamic import of ffmpeg
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
      
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      
      // Load ffmpeg with progress
      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(Math.round(p * 100));
      });
      
      // Load ffmpeg WASM
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setStage('processing');
      setProgress(0);
      
      // Write input video to ffmpeg filesystem
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      
      // Generate overlay filter with ride stats
      // For simplicity, we'll use drawtext filter with static text
      // A more advanced version would create frame-by-frame overlays
      
      const speedUnit = settings.speedUnit.toUpperCase();
      const distanceUnit = settings.distanceUnit === 'miles' ? 'mi' : 'km';
      
      // Calculate stats at video midpoint for demonstration
      // In a full implementation, we'd render frame-by-frame
      const midStats = getStatsAtTime(videoDuration / 2);
      
      // Create overlay filter with semi-transparent background and stats
      const overlayFilter = [
        // Semi-transparent bar at bottom
        `drawbox=x=0:y=ih-80:w=iw:h=80:color=black@0.6:t=fill`,
        // Distance (left)
        `drawtext=text='${formatDistance(ride.distance, settings.distanceUnit)} ${distanceUnit}':fontsize=24:fontcolor=white:x=20:y=h-55:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
        // Speed (center)
        `drawtext=text='${Math.round(ride.averageSpeed)} ${speedUnit}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-60`,
        // Max speed label
        `drawtext=text='MAX ${Math.round(ride.maxSpeed)} ${speedUnit}':fontsize=16:fontcolor=gray:x=(w-text_w)/2:y=h-30`,
        // Duration (right)
        `drawtext=text='${formatDuration(ride.duration)}':fontsize=24:fontcolor=white:x=w-text_w-20:y=h-55`,
      ].join(',');
      
      // Run ffmpeg
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', overlayFilter,
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        'output.mp4',
      ]);
      
      // Read output
      const data = await ffmpeg.readFile('output.mp4');
      // Convert to Blob - handle both Uint8Array and string
      const blobData = typeof data === 'string' 
        ? new TextEncoder().encode(data) 
        : new Uint8Array(data);
      const blob = new Blob([blobData], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      setOutputUrl(url);
      setStage('complete');
      setProgress(100);
      toast.success('Video processed successfully!');
      
    } catch (error) {
      console.error('FFmpeg error:', error);
      setStage('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process video');
      toast.error('Failed to process video');
    }
  };

  const downloadOutput = () => {
    if (!outputUrl) return;
    
    const a = document.createElement('a');
    a.href = outputUrl;
    const baseName = ride.name || `ride-${new Date(ride.startedAt).toISOString().split('T')[0]}`;
    a.download = `${baseName}-overlay.mp4`;
    a.click();
    
    toast.success('Video downloaded!');
  };

  const rideDurationFormatted = formatDuration(ride.duration);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-accent" />
          <h3 className="font-semibold">Add Stats Overlay</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-accent/10 rounded-xl p-3 border border-accent/20">
        <p className="text-xs text-muted-foreground">
          Upload your action cam footage and we'll overlay your ride stats (speed, distance, time) onto the video.
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Ride: {rideDurationFormatted}
          </span>
          <span>{ride.gpsPoints.length} data points</span>
        </div>
      </div>

      {/* File Upload */}
      {!videoFile && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
        >
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Upload Action Cam Video</p>
          <p className="text-xs text-muted-foreground mt-1">MP4, MOV, or WebM</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Video Preview */}
      {videoUrl && (
        <div className="space-y-3">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleVideoLoad}
              controls
              className="w-full h-full object-contain"
            />
          </div>
          
          {/* Video Info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{videoFile?.name}</span>
            <span>{videoDuration > 0 ? formatDuration(Math.floor(videoDuration)) : '...'}</span>
          </div>

          {/* Sync Offset */}
          <div className="bg-secondary/50 rounded-xl p-3 border border-border/30">
            <label className="text-xs font-medium block mb-2">
              Sync Offset (seconds)
            </label>
            <p className="text-[10px] text-muted-foreground mb-2">
              If your video started before/after the ride, adjust this to sync the stats.
            </p>
            <input
              type="range"
              min={-60}
              max={60}
              value={syncOffset}
              onChange={(e) => setSyncOffset(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>-60s</span>
              <span className="font-mono">{syncOffset > 0 ? '+' : ''}{syncOffset}s</span>
              <span>+60s</span>
            </div>
          </div>

          {/* Process Button */}
          {stage === 'idle' && (
            <Button onClick={processVideo} className="w-full gap-2">
              <Play className="w-4 h-4" />
              Process Video with Overlay
            </Button>
          )}

          {/* Progress */}
          {(stage === 'loading-ffmpeg' || stage === 'processing') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span>{stage === 'loading-ffmpeg' ? 'Loading video processor...' : 'Processing video...'}</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-center">
                This may take a few minutes depending on video length
              </p>
            </div>
          )}

          {/* Error */}
          {stage === 'error' && (
            <div className="bg-destructive/10 text-destructive rounded-xl p-3 border border-destructive/20">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium text-sm">Processing Failed</span>
              </div>
              <p className="text-xs">{errorMessage}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={processVideo}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Complete */}
          {stage === 'complete' && outputUrl && (
            <div className="space-y-3">
              <div className="bg-accent/10 rounded-xl p-3 border border-accent/20 flex items-center gap-2">
                <Check className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium">Video ready!</span>
              </div>
              
              {/* Output Preview */}
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                <video
                  src={outputUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
              
              <Button onClick={downloadOutput} className="w-full gap-2">
                <Download className="w-4 h-4" />
                Download Video
              </Button>
            </div>
          )}

          {/* Change Video */}
          {stage !== 'loading-ffmpeg' && stage !== 'processing' && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setVideoFile(null);
                if (videoUrl) URL.revokeObjectURL(videoUrl);
                setVideoUrl(null);
                setOutputUrl(null);
                setStage('idle');
              }}
              className="w-full text-muted-foreground"
            >
              Choose Different Video
            </Button>
          )}
        </div>
      )}

      {/* Hidden canvas for future frame-by-frame processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
