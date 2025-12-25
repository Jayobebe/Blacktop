import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRideHistory } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ColorGradingPanel, ColorGradingValues } from '@/components/ColorGradingPanel';
import { 
  ArrowLeft, 
  Sparkles, 
  Upload, 
  Play, 
  Pause, 
  Download, 
  Clock, 
  AlertCircle, 
  Check,
  GripVertical,
  Maximize2,
  Volume2,
  VolumeX,
  RotateCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDate, formatDuration, formatDistance, formatSpeed } from '@/lib/format';
import { RideSession } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ProcessingStage = 'idle' | 'loading-ffmpeg' | 'processing' | 'complete' | 'error';

// Live Overlay Preview Component
function OverlayLayer({ 
  ride,
  currentTime,
  syncOffset,
  distanceUnit,
  speedUnit,
  fadeInDuration = 1,
  fadeOutDuration = 1,
}: {
  ride: RideSession;
  currentTime: number;
  syncOffset: number;
  distanceUnit: 'miles' | 'km';
  speedUnit: 'mph' | 'kph';
  fadeInDuration?: number; // seconds
  fadeOutDuration?: number; // seconds
}) {
  const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const speedLabel = speedUnit.toUpperCase();
  
  // Calculate stats at current video time
  const rideTimeMs = Math.max(0, (currentTime + syncOffset)) * 1000;
  const rideProgress = Math.min(1, rideTimeMs / (ride.duration * 1000));
  
  const currentDistance = ride.distance * rideProgress;
  const currentDuration = Math.floor(rideTimeMs / 1000);
  
  // Calculate fade opacity based on RIDE timing, not video timing
  // effectiveTime represents where we are in the ride (can be negative before ride starts)
  const rideDuration = ride.duration;
  const effectiveTime = currentTime + syncOffset; // This is the ride time
  let overlayOpacity = 0;
  
  // Before ride starts - hidden
  if (effectiveTime < 0) {
    overlayOpacity = 0;
  }
  // Fade in at the start of the ride
  else if (effectiveTime < fadeInDuration) {
    overlayOpacity = effectiveTime / fadeInDuration;
  }
  // Fade out at the end of the ride
  else if (effectiveTime > rideDuration - fadeOutDuration) {
    overlayOpacity = Math.max(0, (rideDuration - effectiveTime) / fadeOutDuration);
  }
  // After ride ends - hidden
  else if (effectiveTime > rideDuration) {
    overlayOpacity = 0;
  }
  // During the ride - fully visible
  else {
    overlayOpacity = 1;
  }
  
  // Find speed and lean at current time, calculate running maxes from GPS points
  let currentSpeed = 0;
  let currentLean = 0;
  let runningMaxSpeed = 0;
  let runningMaxLeanLeft = 0;
  let runningMaxLeanRight = 0;
  let hasLeanData = false;
  
  // Use high-frequency lean samples if available
  const leanSamples = ride.leanSamples || [];
  if (leanSamples.length > 0) {
    hasLeanData = true;
    const rideStartMs = new Date(ride.startedAt).getTime();
    const currentMs = rideStartMs + rideTimeMs;
    
    // Find lean sample closest to current time and calculate running maxes
    for (const sample of leanSamples) {
      if (sample.timestamp <= currentMs) {
        currentLean = sample.angle;
        if (sample.angle < 0) {
          runningMaxLeanLeft = Math.max(runningMaxLeanLeft, Math.abs(sample.angle));
        } else {
          runningMaxLeanRight = Math.max(runningMaxLeanRight, sample.angle);
        }
      }
    }
  }
  
  if (ride.gpsPoints.length > 0) {
    const targetIndex = Math.floor(rideProgress * (ride.gpsPoints.length - 1));
    
    // Calculate running speed max up to current point
    for (let i = 0; i <= targetIndex; i++) {
      const point = ride.gpsPoints[i];
      const speed = point?.speed || 0;
      if (speed > runningMaxSpeed) runningMaxSpeed = speed;
      
      // Fallback: check for lean data in GPS points if no leanSamples
      if (!hasLeanData && point?.leanAngle !== undefined) {
        hasLeanData = true;
        currentLean = point.leanAngle;
        if (point.leanAngle < 0) {
          runningMaxLeanLeft = Math.max(runningMaxLeanLeft, Math.abs(point.leanAngle));
        } else {
          runningMaxLeanRight = Math.max(runningMaxLeanRight, point.leanAngle);
        }
      }
    }
    
    const currentPoint = ride.gpsPoints[Math.min(targetIndex, ride.gpsPoints.length - 1)];
    currentSpeed = currentPoint?.speed || 0;
  }
  
  const runningMaxLean = Math.max(runningMaxLeanLeft, runningMaxLeanRight);
  
  // For the arc visual - map lean angle to rotation (max 90° range)
  const leanRotation = hasLeanData ? (currentLean / 90) * 90 : 0;
  
  return (
    <div 
      className="absolute inset-0 pointer-events-none transition-opacity duration-150"
      style={{ opacity: overlayOpacity }}
    >
      {/* Top corners - max stats */}
      <div className="absolute top-0 inset-x-0 px-2 pt-1.5 flex justify-between">
        {/* Top Left - Max Speed */}
        <div className="bg-black/60 rounded px-1.5 py-0.5">
          <p className="text-[6px] text-white/50 uppercase">Max Speed</p>
          <p className="font-mono text-[10px] font-bold text-white leading-none">
            {Math.round(runningMaxSpeed)} <span className="text-[8px] text-white/60">{speedLabel}</span>
          </p>
        </div>
        
        {/* Top Right - Max Lean (only show if we have lean data) */}
        {hasLeanData && (
          <div className="bg-black/60 rounded px-1.5 py-0.5 text-right">
            <p className="text-[6px] text-white/50 uppercase">Max Lean</p>
            <p className="font-mono text-[10px] font-bold text-white leading-none">
              {runningMaxLean}°
            </p>
          </div>
        )}
      </div>
      
      {/* Bottom section */}
      <div className="absolute inset-x-0 bottom-0">
        {/* Black faded gradient bar */}
        <div 
          className="w-full h-10"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)'
          }}
        />
        
        {/* Stats overlay */}
        <div className="absolute bottom-0 inset-x-0 px-2 pb-1 flex items-end justify-between">
          {/* Bottom Left - Total Distance */}
          <div className="text-left">
            <p className="font-mono text-[10px] font-bold text-white leading-none">
              {formatDistance(currentDistance, distanceUnit)} <span className="text-[8px] text-white/60">{distLabel}</span>
            </p>
          </div>
          
          {/* Bottom Center - Speed (with lean arc only if we have lean data) */}
          <div className="relative flex flex-col items-center">
            {hasLeanData && (
              <>
                {/* Lean Angle Arc */}
                <svg className="w-14 h-3.5" viewBox="0 0 80 20">
                  {/* Background arc */}
                  <path
                    d="M 4 20 A 38 18 0 0 1 76 20"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Active lean indicator dot - with smooth transition */}
                  <circle
                    cx={40 + Math.sin(leanRotation * Math.PI / 180) * 36}
                    cy={20 - Math.cos(leanRotation * Math.PI / 180) * 16}
                    r="3.5"
                    fill="white"
                    style={{ transition: 'cx 0.15s ease-out, cy 0.15s ease-out' }}
                  />
                </svg>
                
                {/* Live lean angle */}
                <span className="text-[8px] text-white/70 font-mono">{Math.abs(Math.round(currentLean))}°</span>
              </>
            )}
            
            {/* Live speed */}
            <div className="flex items-baseline gap-0.5">
              <span className="font-mono text-sm font-bold text-white leading-none">{Math.round(currentSpeed)}</span>
              <span className="text-[8px] text-white/60">{speedLabel}</span>
            </div>
          </div>
          
          {/* Bottom Right - Total Time */}
          <div className="text-right">
            <p className="font-mono text-[10px] font-bold text-white leading-none">
              {formatDuration(Math.max(0, currentDuration))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Timeline with Playhead Component
function SyncTimeline({
  videoDuration,
  rideDuration,
  currentTime,
  syncOffset,
  onSyncOffsetChange,
  onSeek,
}: {
  videoDuration: number;
  rideDuration: number;
  currentTime: number;
  syncOffset: number;
  onSyncOffsetChange: (offset: number) => void;
  onSeek: (time: number) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingRide, setIsDraggingRide] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  // Total timeline shows full video plus some buffer
  const timelineDuration = Math.max(videoDuration, rideDuration + Math.abs(syncOffset)) + 10;
  
  // Convert time to percentage position
  const timeToPercent = (time: number) => (time / timelineDuration) * 100;
  
  // Video always starts at 0
  const videoStartPercent = 0;
  const videoWidthPercent = timeToPercent(videoDuration);
  
  // Ride position depends on syncOffset
  // syncOffset = how much EARLIER the ride starts relative to video start
  // negative syncOffset = ride starts BEFORE video (ride appears to the left)
  // positive syncOffset = ride starts AFTER video start (ride appears to the right)
  const rideStartTime = -syncOffset; // If syncOffset is -5, ride starts at video time 5
  const rideStartPercent = timeToPercent(Math.max(0, rideStartTime));
  const rideWidthPercent = timeToPercent(rideDuration);
  
  // Playhead position
  const playheadPercent = timeToPercent(currentTime);
  
  const handleTimelineClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percent = (clientX - rect.left) / rect.width;
    const time = percent * timelineDuration;
    onSeek(Math.max(0, Math.min(videoDuration, time)));
  };
  
  const handleRideDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!timelineRef.current || !isDraggingRide) return;
    e.stopPropagation();
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percent = (clientX - rect.left) / rect.width;
    const clickedTime = percent * timelineDuration;
    
    // The ride bar's left edge represents when the ride starts in video time
    // syncOffset = -rideStartTime, so if user drags to time 5, syncOffset = -5
    const newOffset = -clickedTime;
    onSyncOffsetChange(Math.max(-60, Math.min(60, newOffset)));
  }, [isDraggingRide, timelineDuration, onSyncOffsetChange]);

  return (
    <div className="space-y-2">
      {/* Timeline */}
      <div 
        ref={timelineRef}
        className="relative h-20 bg-zinc-800/50 rounded-lg overflow-hidden cursor-pointer"
        onClick={handleTimelineClick}
        onMouseMove={handleRideDrag}
        onMouseUp={() => setIsDraggingRide(false)}
        onMouseLeave={() => setIsDraggingRide(false)}
        onTouchMove={handleRideDrag}
        onTouchEnd={() => setIsDraggingRide(false)}
      >
        {/* Time markers */}
        <div className="absolute inset-x-0 top-0 h-4 flex items-end px-2">
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div 
              key={p} 
              className="absolute flex flex-col items-center"
              style={{ left: `${p * 100}%`, transform: 'translateX(-50%)' }}
            >
              <span className="text-[8px] text-white/30 font-mono">
                {formatDuration(Math.floor(p * timelineDuration))}
              </span>
              <div className="w-px h-1 bg-white/20" />
            </div>
          ))}
        </div>
        
        {/* Tracks area */}
        <div className="absolute inset-x-0 top-5 bottom-1 px-2">
          {/* Video Track (static) */}
          <div 
            className="absolute h-6 rounded bg-accent/80 flex items-center px-2 pointer-events-none"
            style={{ 
              left: `${videoStartPercent}%`, 
              width: `${Math.max(videoWidthPercent, 5)}%`,
              top: '0px'
            }}
          >
            <span className="text-[9px] text-white font-medium truncate">📹 Video</span>
          </div>
          
          {/* Ride Data Track (draggable) */}
          <div 
            className={cn(
              "absolute h-6 rounded bg-blue-500/80 flex items-center px-2 cursor-grab active:cursor-grabbing transition-opacity",
              isDraggingRide && "opacity-70"
            )}
            style={{ 
              left: `${rideStartPercent}%`, 
              width: `${Math.max(rideWidthPercent, 5)}%`,
              top: '28px'
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDraggingRide(true);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              setIsDraggingRide(true);
            }}
          >
            <GripVertical className="w-3 h-3 text-white/70 flex-shrink-0" />
            <span className="text-[9px] text-white font-medium truncate ml-1">🏍️ Ride Data</span>
          </div>
        </div>
        
        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
        </div>
      </div>
      
      {/* Sync explanation */}
      <p className="text-[10px] text-white/40 text-center">
        Drag the ride data track to align with when your ride starts in the video
      </p>
    </div>
  );
}

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides } = useRideHistory();
  const { settings } = useSettings();
  
  const ride = rides.find(r => r.id === id);
  
  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Sync state
  const [syncOffset, setSyncOffset] = useState<number>(0);
  
  // Processing state
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [colorGrading, setColorGrading] = useState<ColorGradingValues>({
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<any>(null);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, []);

  // Update current time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setOutputUrl(null);
    setStage('idle');
    setProgress(0);
    setErrorMessage(null);
    setCurrentTime(0);
    setSyncOffset(0);
  };

  const handleVideoLoad = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(!isMuted);
  };

  const seekBy = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + seconds));
  };

  const nudgeOffset = (direction: number) => {
    setSyncOffset(prev => Math.max(-60, Math.min(60, prev + direction)));
  };

  const processVideo = async () => {
    if (!videoFile || !videoUrl || !ride) return;
    
    setStage('loading-ffmpeg');
    setProgress(0);
    setErrorMessage(null);
    
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
      
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      
      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(Math.round(p * 100));
      });
      
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setStage('processing');
      setProgress(0);
      
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      
      const speedUnit = settings.speedUnit.toUpperCase();
      const distanceUnit = settings.distanceUnit === 'miles' ? 'mi' : 'km';
      const maxLean = Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0);
      const leanDirection = (ride.maxLeanRight || 0) >= (ride.maxLeanLeft || 0) ? 'R' : 'L';
      
      const overlayFilter = [
        `drawbox=x=20:y=ih-100:w=180:h=80:color=black@0.5:t=fill`,
        `drawbox=x=20:y=ih-100:w=180:h=80:color=white@0.1:t=2`,
        `drawbox=x=(iw-320)/2:y=ih-120:w=320:h=100:color=black@0.6:t=fill`,
        `drawbox=x=(iw-320)/2:y=ih-120:w=320:h=100:color=white@0.15:t=2`,
        `drawbox=x=iw-200:y=ih-100:w=180:h=80:color=black@0.5:t=fill`,
        `drawbox=x=iw-200:y=ih-100:w=180:h=80:color=white@0.1:t=2`,
        `drawtext=text='DISTANCE':fontsize=12:fontcolor=white@0.6:x=40:y=h-90`,
        `drawtext=text='${formatDistance(ride.distance, settings.distanceUnit)}':fontsize=28:fontcolor=white:x=40:y=h-70`,
        `drawtext=text='${distanceUnit}':fontsize=14:fontcolor=white@0.7:x=40:y=h-40`,
        `drawtext=text='${Math.round(ride.averageSpeed)}':fontsize=48:fontcolor=white:x=(w-text_w)/2-40:y=h-105`,
        `drawtext=text='${speedUnit}':fontsize=14:fontcolor=white@0.7:x=(w-text_w)/2-40:y=h-55`,
        `drawtext=text='MAX ${Math.round(ride.maxSpeed)} ${speedUnit}':fontsize=14:fontcolor=cyan:x=(w-text_w)/2-40:y=h-35`,
        `drawtext=text='LEAN':fontsize=10:fontcolor=white@0.6:x=(w+120)/2:y=h-110`,
        `drawtext=text='${maxLean.toFixed(0)}':fontsize=32:fontcolor=orange:x=(w+120)/2:y=h-95`,
        `drawtext=text='${leanDirection}':fontsize=14:fontcolor=orange@0.8:x=(w+170)/2:y=h-85`,
        `drawtext=text='DURATION':fontsize=12:fontcolor=white@0.6:x=w-180:y=h-90`,
        `drawtext=text='${formatDuration(ride.duration)}':fontsize=28:fontcolor=white:x=w-180:y=h-70`,
      ].join(',');
      
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', overlayFilter,
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        'output.mp4',
      ]);
      
      const data = await ffmpeg.readFile('output.mp4');
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
    if (!outputUrl || !ride) return;
    
    const a = document.createElement('a');
    a.href = outputUrl;
    const baseName = ride.name || `ride-${new Date(ride.startedAt).toISOString().split('T')[0]}`;
    a.download = `${baseName}-overlay.mp4`;
    a.click();
    
    toast.success('Video downloaded!');
  };

  const resetVideo = () => {
    setVideoFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setOutputUrl(null);
    setStage('idle');
    setCurrentTime(0);
    setSyncOffset(0);
  };

  if (!ride) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Ride not found</p>
        <Button onClick={() => navigate('/history')} className="mt-4">
          Back to History
        </Button>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Header */}
      <header className="flex items-center gap-3 p-3 bg-zinc-900/90 backdrop-blur-sm border-b border-white/10 sticky top-0 z-20">
        <button
          onClick={() => navigate(`/ride/${id}`)}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
            <h1 className="text-sm font-display font-bold text-white truncate">BlackTop Studio</h1>
          </div>
          <p className="text-[10px] text-white/50 truncate">
            {ride.name || formatDate(ride.startedAt)}
          </p>
        </div>
        
        {/* Export Button */}
        {videoUrl && stage === 'idle' && (
          <Button 
            size="sm" 
            onClick={processVideo}
            className="gap-1.5 bg-accent hover:bg-accent/90"
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
        )}
        {stage === 'complete' && (
          <Button 
            size="sm" 
            onClick={downloadOutput}
            className="gap-1.5 bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Save
          </Button>
        )}
      </header>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col">
        {/* Video Preview */}
        <div className="flex-1 relative bg-zinc-950 flex items-center justify-center min-h-[200px]">
          {!videoUrl ? (
            // Upload Prompt
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-4 p-8 cursor-pointer"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-white/70" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Add Action Cam Footage</p>
                <p className="text-xs text-white/50 mt-1">MP4, MOV, or WebM</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : outputUrl && stage === 'complete' ? (
            // Output Preview
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                src={outputUrl}
                controls
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            // Input Video with Overlay
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="relative max-w-full max-h-full aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleVideoLoad}
                  muted={isMuted}
                  className="w-full h-full object-contain"
                  playsInline
                  style={{
                    filter: `brightness(${1 + (colorGrading.lift.r + colorGrading.lift.g + colorGrading.lift.b) / 6 + (colorGrading.gain.r + colorGrading.gain.g + colorGrading.gain.b) / 3}) saturate(${1 + (Math.abs(colorGrading.gamma.r) + Math.abs(colorGrading.gamma.g) + Math.abs(colorGrading.gamma.b)) / 6}) hue-rotate(${(colorGrading.gain.r - colorGrading.gain.b) * 30 + (colorGrading.gamma.r - colorGrading.gamma.b) * 20}deg)`,
                  }}
                />
                {/* Overlay Layer */}
                <OverlayLayer
                  ride={ride}
                  currentTime={currentTime}
                  syncOffset={syncOffset}
                  distanceUnit={settings.distanceUnit}
                  speedUnit={settings.speedUnit}
                />
              </div>
            </div>
          )}
          
          {/* Processing Overlay */}
          {(stage === 'loading-ffmpeg' || stage === 'processing') && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10">
              <div className="w-16 h-16 rounded-full border-4 border-accent border-t-transparent animate-spin" />
              <div className="text-center">
                <p className="text-white font-medium">
                  {stage === 'loading-ffmpeg' ? 'Loading processor...' : 'Processing video...'}
                </p>
                <p className="text-white/50 text-sm mt-1">{progress}%</p>
              </div>
              <Progress value={progress} className="w-48 h-2" />
            </div>
          )}
          
          {/* Error Overlay */}
          {stage === 'error' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10 p-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <div className="text-center">
                <p className="text-white font-medium">Processing Failed</p>
                <p className="text-white/50 text-sm mt-1">{errorMessage}</p>
              </div>
              <Button variant="outline" onClick={processVideo} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          )}
        </div>

        {/* Video Controls */}
        {videoUrl && stage !== 'complete' && (
          <div className="flex items-center justify-center gap-4 py-3 bg-zinc-900/50">
            <button onClick={() => seekBy(-5)} className="p-2 text-white/70 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={togglePlayPause}
              className="w-12 h-12 rounded-full bg-white flex items-center justify-center"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-black" />
              ) : (
                <Play className="w-5 h-5 text-black ml-0.5" />
              )}
            </button>
            <button onClick={() => seekBy(5)} className="p-2 text-white/70 hover:text-white">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={toggleMute} className="p-2 text-white/70 hover:text-white">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-xs text-white/50 font-mono">
              {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(videoDuration))}
            </span>
          </div>
        )}

        {/* Timeline Panel */}
        {videoUrl && stage === 'idle' && (
          <div className="bg-zinc-900 border-t border-white/10 p-4 space-y-4">
            {/* Sync Header with Set Sync Point button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <span className="text-sm text-white font-medium">Sync Overlay</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Set the sync so that ride starts at current video time
                  setSyncOffset(-currentTime);
                  toast.success('Sync point set! Overlay will start here.');
                }}
                className="gap-1.5 text-xs h-7 border-accent/50 text-accent hover:bg-accent/10"
              >
                <Check className="w-3 h-3" />
                Set Sync Point
              </Button>
            </div>
            
            {/* Instructions */}
            <div className="bg-white/5 rounded-lg p-3 text-xs text-white/60 space-y-1">
              <p className="font-medium text-white/80">How to sync:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Play the video and pause when your ride actually starts</li>
                <li>Tap "Set Sync Point" to align the overlay</li>
                <li>Or drag the ride data track on the timeline below</li>
              </ol>
            </div>

            {/* Visual Timeline */}
            <SyncTimeline
              videoDuration={videoDuration}
              rideDuration={ride.duration}
              currentTime={currentTime}
              syncOffset={syncOffset}
              onSyncOffsetChange={setSyncOffset}
              onSeek={(time) => {
                if (videoRef.current) {
                  videoRef.current.currentTime = time;
                }
              }}
            />
            
            {/* Fine-tune controls */}
            <div className="flex items-center justify-center gap-3">
              <span className="text-[10px] text-white/40">Fine-tune:</span>
              <button 
                onClick={() => nudgeOffset(-0.5)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white/70"
              >
                -0.5s
              </button>
              <button 
                onClick={() => nudgeOffset(-0.1)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white/70"
              >
                -0.1s
              </button>
              <span className="text-xs font-mono text-white min-w-[50px] text-center">
                {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s
              </span>
              <button 
                onClick={() => nudgeOffset(0.1)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white/70"
              >
                +0.1s
              </button>
              <button 
                onClick={() => nudgeOffset(0.5)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white/70"
              >
                +0.5s
              </button>
              <button 
                onClick={() => setSyncOffset(0)}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/40 ml-1"
                title="Reset sync"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Reset Button */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetVideo}
              className="w-full text-white/50 hover:text-white hover:bg-white/10"
            >
              Choose Different Video
            </Button>
          </div>
        )}

        {/* Color Grading Panel */}
        {videoUrl && stage === 'idle' && (
          <ColorGradingPanel
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            videoDuration={videoDuration}
            onGradingChange={setColorGrading}
          />
        )}

        {/* Success Panel */}
        {stage === 'complete' && (
          <div className="bg-zinc-900 border-t border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <Check className="w-5 h-5" />
              <span className="font-medium">Video ready!</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={downloadOutput} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
                <Download className="w-4 h-4" />
                Download Video
              </Button>
              <Button variant="outline" onClick={resetVideo} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                New
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
