import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpeedIndicatorProps {
  currentSpeed: number;
  topSpeed: number;
}

export function SpeedIndicator({ currentSpeed, topSpeed }: SpeedIndicatorProps) {
  const speedPercentage = Math.min((currentSpeed / 120) * 100, 100);
  
  const getSpeedColor = () => {
    if (currentSpeed > 80) return 'text-destructive';
    if (currentSpeed > 60) return 'text-warning';
    return 'text-accent';
  };

  const getBarColor = () => {
    if (currentSpeed > 80) return 'bg-destructive';
    if (currentSpeed > 60) return 'bg-warning';
    return 'bg-accent';
  };

  return (
    <div className="glass rounded-2xl p-4 animate-slide-up delay-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm font-semibold text-muted-foreground tracking-wider uppercase">
          Current Speed
        </h2>
        <Gauge className={cn("w-5 h-5", getSpeedColor())} />
      </div>

      <div className="flex items-end justify-between mb-4">
        <div>
          <span className={cn(
            "font-display text-5xl font-bold tracking-tight",
            getSpeedColor()
          )}>
            {currentSpeed}
          </span>
          <span className="text-lg text-muted-foreground ml-1">mph</span>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Top Speed</p>
          <p className="font-mono font-semibold text-foreground">{topSpeed} mph</p>
        </div>
      </div>

      {/* Speed bar */}
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            getBarColor()
          )}
          style={{ width: `${speedPercentage}%` }}
        />
      </div>
      
      {/* Speed markers */}
      <div className="flex justify-between mt-1 text-xs text-muted-foreground font-mono">
        <span>0</span>
        <span>40</span>
        <span>80</span>
        <span>120</span>
      </div>
    </div>
  );
}
