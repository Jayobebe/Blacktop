import { cn } from '@/lib/utils';

interface LeanAngleBarProps {
  currentLean: number; // -90 to 90 degrees
  maxLean: number; // Maximum recorded lean
  threshold: number; // Warning threshold in degrees
  onReset?: () => void; // Called when bar is tapped to zero
  className?: string;
}

export function LeanAngleBar({ currentLean, maxLean, threshold, onReset, className }: LeanAngleBarProps) {
  const absLean = Math.abs(currentLean);
  const isOverThreshold = absLean >= threshold;
  
  // Map lean angle to bar position: -60° = 0%, 0° = 50%, +60° = 100%
  const position = ((currentLean + 60) / 120) * 100;
  const clampedPosition = Math.max(0, Math.min(100, position));
  
  // Get color based on lean angle and threshold
  const getIndicatorColor = () => {
    if (isOverThreshold) {
      return 'hsl(0, 84%, 60%)'; // Red
    }
    
    const ratio = absLean / threshold;
    
    if (ratio < 0.33) {
      const hue = 120 - (ratio / 0.33) * 60; // Green to yellow
      return `hsl(${hue}, 85%, 50%)`;
    } else if (ratio < 0.66) {
      const hue = 60 - ((ratio - 0.33) / 0.33) * 30; // Yellow to orange
      return `hsl(${hue}, 90%, 55%)`;
    } else {
      const hue = 30 - ((ratio - 0.66) / 0.34) * 30; // Orange to red
      return `hsl(${hue}, 85%, 55%)`;
    }
  };
  
  const indicatorColor = getIndicatorColor();
  
  return (
    <button 
      onClick={onReset}
      className={cn("flex flex-col items-center gap-1 touch-target", className)}
      title="Tap to zero"
    >
      <div className="relative w-48 landscape:w-40 h-3 rounded-full overflow-hidden bg-muted/30">
        {/* Rainbow gradient background */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(to right, hsl(0, 85%, 55%), hsl(30, 90%, 55%), hsl(120, 85%, 50%), hsl(30, 90%, 55%), hsl(0, 85%, 55%))'
          }}
        />
        
        {/* Threshold markers */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-destructive/60"
          style={{ left: `${((60 - threshold) / 120) * 100}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-destructive/60"
          style={{ left: `${((60 + threshold) / 120) * 100}%` }}
        />
        
        {/* Center marker */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/40 left-1/2 -translate-x-1/2" />
        
        {/* Active indicator */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background transition-all duration-100",
            isOverThreshold && "animate-pulse"
          )}
          style={{
            left: `calc(${clampedPosition}% - 8px)`,
            backgroundColor: indicatorColor,
            boxShadow: isOverThreshold 
              ? `0 0 12px ${indicatorColor}` 
              : `0 0 6px ${indicatorColor}`,
          }}
        />
      </div>
      
      {/* Current lean and max display */}
      <div className="flex items-center gap-3 text-xs">
        <span 
          className={cn(
            "font-mono font-bold text-base transition-colors",
            isOverThreshold && "text-destructive animate-pulse"
          )}
          style={{ color: isOverThreshold ? undefined : indicatorColor }}
        >
          {absLean}°
          <span className="text-muted-foreground ml-0.5 text-xs font-normal">
            {currentLean < -2 ? 'L' : currentLean > 2 ? 'R' : ''}
          </span>
        </span>
        <span className="text-muted-foreground">
          max {maxLean}°
        </span>
      </div>
    </button>
  );
}
