import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ColorWheelProps {
  label: string;
  value: { r: number; g: number; b: number };
  onChange: (value: { r: number; g: number; b: number }) => void;
  size?: 'sm' | 'md';
}

function ColorWheel({ label, value, onChange, size = 'md' }: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const wheelSize = size === 'sm' ? 'w-16 h-16' : 'w-20 h-20';
  
  const offsetToPosition = (r: number, g: number, b: number) => {
    const x = (r - b) / 2;
    const y = -g;
    return { x: x * 40 + 50, y: y * 40 + 50 };
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
    
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    
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
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-white/60 uppercase tracking-wider">{label}</span>
      <div
        ref={wheelRef}
        className={cn("relative rounded-full cursor-crosshair touch-none", wheelSize)}
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
        <div 
          className="absolute inset-2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 70%)',
          }}
        />
        <div 
          className="absolute w-2.5 h-2.5 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
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

// Offset wheel for overall contrast
interface OffsetWheelProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function OffsetWheel({ label, value, onChange }: OffsetWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    
    const dy = (centerY - clientY) / radius;
    const newValue = Math.max(-1, Math.min(1, dy));
    
    onChange(newValue);
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
  
  const indicatorY = 50 - value * 40;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-white/60 uppercase tracking-wider">{label}</span>
      <div
        ref={wheelRef}
        className="relative w-16 h-16 rounded-full cursor-ns-resize touch-none"
        style={{
          background: 'linear-gradient(to bottom, white 0%, gray 50%, black 100%)',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div 
          className="absolute w-3 h-3 rounded-full border-2 border-accent shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: '50%',
            top: `${indicatorY}%`,
            backgroundColor: `rgb(${128 + value * 127}, ${128 + value * 127}, ${128 + value * 127})`,
          }}
        />
      </div>
      <span className="text-[9px] text-white/40 font-mono">
        {value > 0 ? '+' : ''}{(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

// Level Slider component for tonal adjustments
interface LevelSliderProps {
  label: string;
  value: number; // -1 to 1
  onChange: (value: number) => void;
  color?: string;
  icon?: React.ReactNode;
}

function LevelSlider({ label, value, onChange, color = 'white', icon }: LevelSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleInteraction = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = (clientX - rect.left) / rect.width;
    const newValue = Math.max(-1, Math.min(1, (percent - 0.5) * 2));
    
    onChange(newValue);
  }, [onChange]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleInteraction(e.clientX);
    }
  }, [isDragging, handleInteraction]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    handleInteraction(touch.clientX);
  };
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      handleInteraction(touch.clientX);
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
  
  const indicatorPercent = (value + 1) / 2 * 100;
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 w-20">
        {icon}
        <span className="text-[10px] text-white/60 uppercase tracking-wider">{label}</span>
      </div>
      <div
        ref={sliderRef}
        className="flex-1 h-6 rounded-full cursor-ew-resize touch-none relative overflow-hidden"
        style={{
          background: `linear-gradient(to right, 
            rgba(0,0,0,0.8) 0%, 
            rgba(60,60,60,0.8) 50%, 
            ${color === 'white' ? 'rgba(255,255,255,0.8)' : color} 100%
          )`,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Center marker */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
        
        {/* Indicator */}
        <div 
          className="absolute top-1 bottom-1 w-3 rounded-full shadow-lg transform -translate-x-1/2 transition-none"
          style={{
            left: `${indicatorPercent}%`,
            backgroundColor: color,
            border: '2px solid white',
          }}
        />
      </div>
      <span className="text-[9px] text-white/40 font-mono w-8 text-right">
        {value > 0 ? '+' : ''}{(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

// Levels adjustments interface
interface LevelsValues {
  shadows: number;
  midtones: number;
  highlights: number;
  blacks: number;
  whites: number;
}

interface ColorGradingValues {
  lift: { r: number; g: number; b: number };
  gamma: { r: number; g: number; b: number };
  gain: { r: number; g: number; b: number };
  offset: number;
  levels: LevelsValues;
}

interface ColorGradingPanelProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoDuration: number;
  onGradingChange: (values: ColorGradingValues) => void;
}

const defaultLevels: LevelsValues = {
  shadows: 0,
  midtones: 0,
  highlights: 0,
  blacks: 0,
  whites: 0,
};

export function ColorGradingPanel({ videoRef, videoDuration, onGradingChange }: ColorGradingPanelProps) {
  const [frames, setFrames] = useState<{ time: number; dataUrl: string }[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [grading, setGrading] = useState<ColorGradingValues>({
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: 0,
    levels: { ...defaultLevels },
  });
  
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
    
    const aspectRatio = video.videoWidth / video.videoHeight;
    canvas.width = 100;
    canvas.height = 100 / aspectRatio;
    
    const frameCount = 5;
    const newFrames: { time: number; dataUrl: string }[] = [];
    
    const timestamps: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      const time = (videoDuration / (frameCount + 1)) * (i + 1);
      timestamps.push(Math.max(0.5, Math.min(videoDuration - 0.5, time)));
    }
    
    for (const time of timestamps) {
      try {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          setTimeout(() => resolve(), 2000);
        });
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        newFrames.push({ time, dataUrl });
      } catch (e) {
        console.error('Error extracting frame:', e);
      }
    }
    
    setFrames(newFrames);
    setIsExtracting(false);
    setHasExtracted(true);
    
    video.currentTime = 0;
  }, [videoRef, videoDuration]);
  
  const handleExtractFrames = useCallback(() => {
    if (!hasExtracted && !isExtracting) {
      extractFrames();
    }
  }, [hasExtracted, isExtracting, extractFrames]);
  
  useEffect(() => {
    onGradingChange(grading);
  }, [grading, onGradingChange]);
  
  const updateGrading = (key: keyof Omit<ColorGradingValues, 'offset' | 'levels'>, value: { r: number; g: number; b: number }) => {
    setGrading(prev => ({ ...prev, [key]: value }));
  };
  
  const updateOffset = (value: number) => {
    setGrading(prev => ({ ...prev, offset: value }));
  };
  
  const updateLevel = (key: keyof LevelsValues, value: number) => {
    setGrading(prev => ({
      ...prev,
      levels: { ...prev.levels, [key]: value },
    }));
  };
  
  const resetGrading = () => {
    setGrading({
      lift: { r: 0, g: 0, b: 0 },
      gamma: { r: 0, g: 0, b: 0 },
      gain: { r: 0, g: 0, b: 0 },
      offset: 0,
      levels: { ...defaultLevels },
    });
  };
  
  // Generate CSS filter from grading values
  const getFilterStyle = () => {
    const { lift, gamma, gain, offset, levels } = grading;
    
    const liftBrightness = 1 + (lift.r + lift.g + lift.b) / 6;
    const gainBrightness = 1 + (gain.r + gain.g + gain.b) / 3;
    const gammaSaturation = 1 + (Math.abs(gamma.r) + Math.abs(gamma.g) + Math.abs(gamma.b)) / 6;
    const hueShift = (gain.r - gain.b) * 30 + (gamma.r - gamma.b) * 20;
    
    // Calculate from levels
    const shadowBrightness = 1 + levels.shadows * 0.2;
    const highlightBrightness = 1 + levels.highlights * 0.2;
    const midtoneGamma = 1 - levels.midtones * 0.3;
    const blackLevel = Math.max(0, levels.blacks * 0.15);
    const whiteLevel = 1 + levels.whites * 0.15;
    
    const totalBrightness = liftBrightness * gainBrightness * shadowBrightness * highlightBrightness * whiteLevel;
    const contrast = (1 + offset * 0.5) * (1 - blackLevel);
    
    return {
      filter: `brightness(${totalBrightness}) contrast(${contrast}) saturate(${gammaSaturation}) hue-rotate(${hueShift}deg)`,
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
      
      {/* Color Wheels - 4 wheels in a row */}
      <div className="flex justify-center gap-4">
        <ColorWheel 
          label="Lift" 
          value={grading.lift} 
          onChange={(v) => updateGrading('lift', v)}
          size="sm"
        />
        <ColorWheel 
          label="Gamma" 
          value={grading.gamma} 
          onChange={(v) => updateGrading('gamma', v)}
          size="sm"
        />
        <ColorWheel 
          label="Gain" 
          value={grading.gain} 
          onChange={(v) => updateGrading('gain', v)}
          size="sm"
        />
        <OffsetWheel
          label="Offset"
          value={grading.offset}
          onChange={updateOffset}
        />
      </div>
      
      {/* Tonal Range Sliders */}
      <div className="space-y-2 bg-zinc-800/50 rounded-lg p-3">
        <span className="text-xs text-white/40 block mb-2">Tonal Levels</span>
        
        <LevelSlider
          label="Blacks"
          value={grading.levels.blacks}
          onChange={(v) => updateLevel('blacks', v)}
          color="#333"
        />
        <LevelSlider
          label="Shadows"
          value={grading.levels.shadows}
          onChange={(v) => updateLevel('shadows', v)}
          color="#666"
        />
        <LevelSlider
          label="Midtones"
          value={grading.levels.midtones}
          onChange={(v) => updateLevel('midtones', v)}
          color="#999"
        />
        <LevelSlider
          label="Highlights"
          value={grading.levels.highlights}
          onChange={(v) => updateLevel('highlights', v)}
          color="#ccc"
        />
        <LevelSlider
          label="Whites"
          value={grading.levels.whites}
          onChange={(v) => updateLevel('whites', v)}
          color="#fff"
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

export type { ColorGradingValues };