import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ColorWheelProps {
  label: string;
  value: { r: number; g: number; b: number };
  onChange: (value: { r: number; g: number; b: number }) => void;
}

function ColorWheel({ label, value, onChange }: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Convert RGB offset (-1 to 1) to position on wheel
  const offsetToPosition = (r: number, g: number, b: number) => {
    // Use r-b for x (red-cyan axis) and g for y (green-magenta axis)
    const x = (r - b) / 2;
    const y = -g;
    return { x: x * 40 + 50, y: y * 40 + 50 }; // Scale to percentage
  };
  
  const pos = offsetToPosition(value.r, value.g, value.b);
  
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    
    let dx = (clientX - centerX) / radius;
    let dy = (clientY - centerY) / radius;
    
    // Clamp to circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    
    // Convert position to RGB offsets
    // x axis: red(+) to cyan(-)
    // y axis: magenta(+) to green(-)
    const r = dx * 0.5;
    const g = -dy * 0.5;
    const b = -dx * 0.5;
    
    onChange({ r, g, b });
  }, [onChange]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleInteraction(e.clientX, e.clientY);
    }
  }, [isDragging, handleInteraction]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  };
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      handleInteraction(touch.clientX, touch.clientY);
    }
  }, [isDragging, handleInteraction]);
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);
  
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-white/60 uppercase tracking-wider">{label}</span>
      <div
        ref={wheelRef}
        className="relative w-20 h-20 rounded-full cursor-crosshair touch-none"
        style={{
          background: `conic-gradient(
            from 0deg,
            hsl(0, 70%, 50%),
            hsl(60, 70%, 50%),
            hsl(120, 70%, 50%),
            hsl(180, 70%, 50%),
            hsl(240, 70%, 50%),
            hsl(300, 70%, 50%),
            hsl(360, 70%, 50%)
          )`,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Inner gradient for brightness */}
        <div 
          className="absolute inset-2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 70%)',
          }}
        />
        {/* Center indicator */}
        <div 
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            backgroundColor: `rgb(${128 + value.r * 127}, ${128 + value.g * 127}, ${128 + value.b * 127})`,
          }}
        />
      </div>
    </div>
  );
}

interface ColorGradingValues {
  lift: { r: number; g: number; b: number };
  gamma: { r: number; g: number; b: number };
  gain: { r: number; g: number; b: number };
}

interface ColorGradingPanelProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoDuration: number;
  onGradingChange: (values: ColorGradingValues) => void;
}

export function ColorGradingPanel({ videoRef, videoDuration, onGradingChange }: ColorGradingPanelProps) {
  const [frames, setFrames] = useState<{ time: number; dataUrl: string }[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [grading, setGrading] = useState<ColorGradingValues>({
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
  });
  
  // Extract 5 frames from video at evenly distributed times (lazy - only on demand)
  const extractFrames = useCallback(async () => {
    if (!videoRef.current || videoDuration <= 0) return;
    
    setIsExtracting(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      setIsExtracting(false);
      return;
    }
    
    // Set canvas size (optimized smaller thumbnail size for speed)
    const aspectRatio = video.videoWidth / video.videoHeight;
    canvas.width = 100;
    canvas.height = 100 / aspectRatio;
    
    const frameCount = 5;
    const newFrames: { time: number; dataUrl: string }[] = [];
    
    // Generate timestamps evenly distributed (no randomness for speed)
    const timestamps: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      const time = (videoDuration / (frameCount + 1)) * (i + 1);
      timestamps.push(Math.max(0.5, Math.min(videoDuration - 0.5, time)));
    }
    
    // Extract frames
    for (const time of timestamps) {
      try {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          // Timeout fallback for slow seeks
          setTimeout(() => resolve(), 2000);
        });
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Lower quality for faster encoding
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        newFrames.push({ time, dataUrl });
      } catch (e) {
        console.error('Error extracting frame:', e);
      }
    }
    
    setFrames(newFrames);
    setIsExtracting(false);
    setHasExtracted(true);
    
    // Reset video to start
    video.currentTime = 0;
  }, [videoRef, videoDuration]);
  
  // Lazy extraction - only extract when user clicks, not automatically
  const handleExtractFrames = useCallback(() => {
    if (!hasExtracted && !isExtracting) {
      extractFrames();
    }
  }, [hasExtracted, isExtracting, extractFrames]);
  
  // Notify parent of grading changes
  useEffect(() => {
    onGradingChange(grading);
  }, [grading, onGradingChange]);
  
  const updateGrading = (key: keyof ColorGradingValues, value: { r: number; g: number; b: number }) => {
    setGrading(prev => ({ ...prev, [key]: value }));
  };
  
  const resetGrading = () => {
    setGrading({
      lift: { r: 0, g: 0, b: 0 },
      gamma: { r: 0, g: 0, b: 0 },
      gain: { r: 0, g: 0, b: 0 },
    });
  };
  
  // Generate CSS filter from grading values
  const getFilterStyle = () => {
    // Convert grading to approximate CSS filters
    // This is a simplified approximation - real color grading is more complex
    const { lift, gamma, gain } = grading;
    
    // Calculate overall brightness/contrast adjustments
    const liftBrightness = 1 + (lift.r + lift.g + lift.b) / 6;
    const gainBrightness = 1 + (gain.r + gain.g + gain.b) / 3;
    const gammaSaturation = 1 + (Math.abs(gamma.r) + Math.abs(gamma.g) + Math.abs(gamma.b)) / 6;
    
    // Calculate hue rotation from color balance
    const hueShift = (gain.r - gain.b) * 30 + (gamma.r - gamma.b) * 20;
    
    return {
      filter: `brightness(${liftBrightness * gainBrightness}) saturate(${gammaSaturation}) hue-rotate(${hueShift}deg)`,
    };
  };
  
  const filterStyle = getFilterStyle();
  
  return (
    <div className="bg-zinc-900 border-t border-white/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Color Grading</h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={resetGrading}
          className="text-white/50 hover:text-white h-8 px-2"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>
      
      {/* Color Wheels */}
      <div className="flex justify-center gap-6">
        <ColorWheel 
          label="Lift" 
          value={grading.lift} 
          onChange={(v) => updateGrading('lift', v)} 
        />
        <ColorWheel 
          label="Gamma" 
          value={grading.gamma} 
          onChange={(v) => updateGrading('gamma', v)} 
        />
        <ColorWheel 
          label="Gain" 
          value={grading.gain} 
          onChange={(v) => updateGrading('gain', v)} 
        />
      </div>
      
      {/* Frame Thumbnails - Lazy loaded */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Preview Frames</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={extractFrames}
            disabled={isExtracting}
            className="text-white/50 hover:text-white h-6 px-2 text-xs"
          >
            {isExtracting ? 'Extracting...' : hasExtracted ? 'Refresh Frames' : 'Load Previews'}
          </Button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20">
          {isExtracting ? (
            <div className="flex items-center justify-center w-full py-4">
              <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          ) : frames.length > 0 ? (
            frames.map((frame, index) => (
              <div 
                key={index} 
                className="flex-shrink-0 rounded overflow-hidden border border-white/10"
              >
                <img 
                  src={frame.dataUrl} 
                  alt={`Frame ${index + 1}`}
                  className="w-20 h-auto"
                  style={filterStyle}
                />
                <div className="bg-black/60 text-[9px] text-white/50 text-center py-0.5">
                  {Math.floor(frame.time / 60)}:{String(Math.floor(frame.time % 60)).padStart(2, '0')}
                </div>
              </div>
            ))
          ) : (
            <button 
              onClick={handleExtractFrames}
              className="flex items-center justify-center w-full py-4 text-white/30 text-sm hover:text-white/50 transition-colors"
            >
              Tap to load preview frames
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Export the grading values type for use in parent
export type { ColorGradingValues };
