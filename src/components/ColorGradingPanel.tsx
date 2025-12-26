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
  
  // Convert RGB offset (-1 to 1) to position on wheel
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

// Offset wheel for overall contrast (black/white slider style)
interface OffsetWheelProps {
  label: string;
  value: number; // -1 to 1
  onChange: (value: number) => void;
}

function OffsetWheel({ label, value, onChange }: OffsetWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    
    // Use distance from center for offset value
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

// Curves/Levels control point
interface CurvePoint {
  x: number; // 0-1 (input level)
  y: number; // 0-1 (output level)
}

interface LevelsCurveProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  channel: 'rgb' | 'r' | 'g' | 'b';
}

function LevelsCurve({ points, onChange, channel }: LevelsCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  
  const channelColors = {
    rgb: 'white',
    r: '#ff6b6b',
    g: '#69db7c',
    b: '#74c0fc',
  };
  
  const color = channelColors[channel];
  
  // Generate smooth curve path through points
  const generatePath = () => {
    if (points.length < 2) return '';
    
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    const pathPoints = sortedPoints.map(p => ({
      x: p.x * 100,
      y: (1 - p.y) * 100,
    }));
    
    let path = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
    
    for (let i = 1; i < pathPoints.length; i++) {
      const prev = pathPoints[i - 1];
      const curr = pathPoints[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
    }
    
    return path;
  };
  
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || draggingIndex !== null) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    
    // Add new point
    const newPoints = [...points, { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }];
    onChange(newPoints);
  };
  
  const handlePointMouseDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingIndex(index);
  };
  
  const handlePointTouchStart = (index: number, e: React.TouchEvent) => {
    e.stopPropagation();
    setDraggingIndex(index);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingIndex === null || !svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    
    const newPoints = [...points];
    // Don't allow moving first or last point horizontally
    if (draggingIndex === 0) {
      newPoints[draggingIndex] = { x: 0, y };
    } else if (draggingIndex === points.length - 1) {
      newPoints[draggingIndex] = { x: 1, y };
    } else {
      newPoints[draggingIndex] = { x, y };
    }
    onChange(newPoints);
  }, [draggingIndex, points, onChange]);
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (draggingIndex === null || !svgRef.current) return;
    
    const touch = e.touches[0];
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (touch.clientY - rect.top) / rect.height));
    
    const newPoints = [...points];
    if (draggingIndex === 0) {
      newPoints[draggingIndex] = { x: 0, y };
    } else if (draggingIndex === points.length - 1) {
      newPoints[draggingIndex] = { x: 1, y };
    } else {
      newPoints[draggingIndex] = { x, y };
    }
    onChange(newPoints);
  }, [draggingIndex, points, onChange]);
  
  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);
  
  const handleDoubleClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't delete first or last point
    if (index === 0 || index === points.length - 1) return;
    
    const newPoints = points.filter((_, i) => i !== index);
    onChange(newPoints);
  };
  
  useEffect(() => {
    if (draggingIndex !== null) {
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
  }, [draggingIndex, handleMouseMove, handleMouseUp, handleTouchMove]);
  
  const sortedPoints = [...points].sort((a, b) => a.x - b.x);
  
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className="w-full h-24 bg-zinc-800 rounded border border-white/10 cursor-crosshair touch-none"
      onClick={handleSvgClick}
      preserveAspectRatio="none"
    >
      {/* Grid lines */}
      <line x1="25" y1="0" x2="25" y2="100" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1="75" y1="0" x2="75" y2="100" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1="0" y1="25" x2="100" y2="25" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      
      {/* Diagonal reference line */}
      <line x1="0" y1="100" x2="100" y2="0" stroke="white" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2,2" />
      
      {/* Curve path */}
      <path
        d={generatePath()}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      
      {/* Control points */}
      {sortedPoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x * 100}
          cy={(1 - point.y) * 100}
          r="4"
          fill={color}
          stroke="white"
          strokeWidth="1"
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => handlePointMouseDown(index, e)}
          onTouchStart={(e) => handlePointTouchStart(index, e)}
          onDoubleClick={(e) => handleDoubleClick(index, e)}
        />
      ))}
    </svg>
  );
}

interface ColorGradingValues {
  lift: { r: number; g: number; b: number };
  gamma: { r: number; g: number; b: number };
  gain: { r: number; g: number; b: number };
  offset: number;
  curves: {
    rgb: CurvePoint[];
  };
}

interface ColorGradingPanelProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoDuration: number;
  onGradingChange: (values: ColorGradingValues) => void;
}

const defaultCurvePoints: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export function ColorGradingPanel({ videoRef, videoDuration, onGradingChange }: ColorGradingPanelProps) {
  const [frames, setFrames] = useState<{ time: number; dataUrl: string }[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [grading, setGrading] = useState<ColorGradingValues>({
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
    offset: 0,
    curves: {
      rgb: [...defaultCurvePoints],
    },
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
  
  const updateGrading = (key: keyof Omit<ColorGradingValues, 'offset' | 'curves'>, value: { r: number; g: number; b: number }) => {
    setGrading(prev => ({ ...prev, [key]: value }));
  };
  
  const updateOffset = (value: number) => {
    setGrading(prev => ({ ...prev, offset: value }));
  };
  
  const updateCurve = (channel: 'rgb', points: CurvePoint[]) => {
    setGrading(prev => ({
      ...prev,
      curves: { ...prev.curves, [channel]: points },
    }));
  };
  
  const resetGrading = () => {
    setGrading({
      lift: { r: 0, g: 0, b: 0 },
      gamma: { r: 0, g: 0, b: 0 },
      gain: { r: 0, g: 0, b: 0 },
      offset: 0,
      curves: {
        rgb: [...defaultCurvePoints],
      },
    });
  };
  
  // Generate CSS filter from grading values
  const getFilterStyle = () => {
    const { lift, gamma, gain, offset, curves } = grading;
    
    const liftBrightness = 1 + (lift.r + lift.g + lift.b) / 6;
    const gainBrightness = 1 + (gain.r + gain.g + gain.b) / 3;
    const gammaSaturation = 1 + (Math.abs(gamma.r) + Math.abs(gamma.g) + Math.abs(gamma.b)) / 6;
    const hueShift = (gain.r - gain.b) * 30 + (gamma.r - gamma.b) * 20;
    
    // Calculate contrast from offset and curves
    const contrast = 1 + offset * 0.5;
    
    // Calculate curve effect (simple midpoint adjustment)
    const curveEffect = curves.rgb.length > 2 ? 1.1 : 1;
    
    return {
      filter: `brightness(${liftBrightness * gainBrightness * curveEffect}) contrast(${contrast}) saturate(${gammaSaturation}) hue-rotate(${hueShift}deg)`,
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
      
      {/* Levels Curve */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Levels Curve</span>
          <span className="text-[9px] text-white/30">Tap to add points, double-tap to remove</span>
        </div>
        <LevelsCurve
          points={grading.curves.rgb}
          onChange={(points) => updateCurve('rgb', points)}
          channel="rgb"
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