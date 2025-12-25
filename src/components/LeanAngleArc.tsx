import { cn } from '@/lib/utils';

interface LeanAngleArcProps {
  currentLean: number; // -90 to 90 degrees
  maxLean: number; // Maximum recorded lean
  threshold: number; // Warning threshold in degrees
  className?: string;
}

export function LeanAngleArc({ currentLean, maxLean, threshold, className }: LeanAngleArcProps) {
  const absLean = Math.abs(currentLean);
  const isOverThreshold = absLean >= threshold;
  
  // Calculate the arc position (0-100%)
  // Map lean angle to arc position: -90° = 0%, 0° = 50%, +90° = 100%
  const arcPosition = ((currentLean + 90) / 180) * 100;
  const clampedPosition = Math.max(0, Math.min(100, arcPosition));
  
  // Get color based on lean angle and threshold
  const getIndicatorColor = () => {
    if (isOverThreshold) {
      return 'hsl(0, 84%, 60%)'; // Red
    }
    
    // Rainbow gradient from green (upright) to yellow to orange to red (leaned)
    const ratio = absLean / threshold;
    
    if (ratio < 0.33) {
      // Green to yellow
      const hue = 120 - (ratio / 0.33) * 60; // 120 (green) to 60 (yellow)
      return `hsl(${hue}, 85%, 50%)`;
    } else if (ratio < 0.66) {
      // Yellow to orange
      const hue = 60 - ((ratio - 0.33) / 0.33) * 30; // 60 (yellow) to 30 (orange)
      return `hsl(${hue}, 90%, 55%)`;
    } else {
      // Orange to red
      const hue = 30 - ((ratio - 0.66) / 0.34) * 30; // 30 (orange) to 0 (red)
      return `hsl(${hue}, 85%, 55%)`;
    }
  };
  
  const indicatorColor = getIndicatorColor();
  
  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* Arc container */}
      <div className="relative w-32 h-16 landscape:w-24 landscape:h-12">
        {/* Arc background with gradient */}
        <svg 
          viewBox="0 0 100 50" 
          className="w-full h-full"
          style={{ overflow: 'visible' }}
        >
          {/* Background arc - rainbow gradient */}
          <defs>
            <linearGradient id="leanArcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(0, 85%, 55%)" />
              <stop offset="25%" stopColor="hsl(30, 90%, 55%)" />
              <stop offset="50%" stopColor="hsl(120, 85%, 50%)" />
              <stop offset="75%" stopColor="hsl(30, 90%, 55%)" />
              <stop offset="100%" stopColor="hsl(0, 85%, 55%)" />
            </linearGradient>
          </defs>
          
          {/* Arc path - semi-circle */}
          <path
            d="M 5 45 A 45 45 0 0 1 95 45"
            fill="none"
            stroke="url(#leanArcGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.3"
          />
          
          {/* Threshold markers */}
          {/* Left threshold */}
          <circle
            cx={5 + ((90 - threshold) / 180) * 90}
            cy={45 - Math.sin(((90 - threshold) / 90) * Math.PI / 2) * 42}
            r="2"
            fill="hsl(0, 84%, 60%)"
            opacity="0.6"
          />
          {/* Right threshold */}
          <circle
            cx={5 + ((90 + threshold) / 180) * 90}
            cy={45 - Math.sin(((90 + threshold) / 90) * Math.PI / 2) * 42}
            r="2"
            fill="hsl(0, 84%, 60%)"
            opacity="0.6"
          />
          
          {/* Active indicator */}
          <circle
            cx={5 + (clampedPosition / 100) * 90}
            cy={45 - Math.sin((clampedPosition / 50 - 1) * Math.PI / 2) * 42}
            r="5"
            fill={indicatorColor}
            className={cn(
              "transition-all duration-100",
              isOverThreshold && "animate-pulse"
            )}
            style={{
              filter: isOverThreshold ? `drop-shadow(0 0 8px ${indicatorColor})` : `drop-shadow(0 0 4px ${indicatorColor})`,
            }}
          />
        </svg>
      </div>
      
      {/* Current lean angle display */}
      <div className="flex items-baseline gap-1 -mt-1">
        <span 
          className={cn(
            "font-mono text-2xl landscape:text-xl font-bold transition-colors",
            isOverThreshold && "text-destructive animate-pulse"
          )}
          style={{ color: isOverThreshold ? undefined : indicatorColor }}
        >
          {absLean}°
        </span>
        <span className="text-[10px] text-muted-foreground uppercase">
          {currentLean < -2 ? 'L' : currentLean > 2 ? 'R' : ''}
        </span>
      </div>
      
      {/* Max lean indicator */}
      <div className="text-[10px] text-muted-foreground">
        MAX {maxLean}°
      </div>
    </div>
  );
}
