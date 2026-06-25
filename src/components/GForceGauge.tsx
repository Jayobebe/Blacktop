import { memo } from 'react';
import { cn } from '@/lib/utils';

interface GForceGaugeProps {
  currentG: number; // total acceleration magnitude in g (includes gravity, ~1.0 at rest)
  maxG: number;
  className?: string;
}

const GAUGE_MAX_G = 3; // full-scale reading on the dial
const WARN_G = 1.8;
const DANGER_G = 2.4;

// 270° sweep gauge, like a speedometer: starts bottom-left, ends bottom-right
const START_ANGLE = -225;
const SWEEP = 270;
const RADIUS = 40;
const CENTER = 50;

function toXY(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
}

const trackStart = toXY(START_ANGLE);
const trackEnd = toXY(START_ANGLE + SWEEP);
const TRACK_PATH = `M ${trackStart.x} ${trackStart.y} A ${RADIUS} ${RADIUS} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

export const GForceGauge = memo(function GForceGauge({ currentG, maxG, className }: GForceGaugeProps) {
  const clampedG = Math.max(0, Math.min(GAUGE_MAX_G, currentG));
  const fraction = clampedG / GAUGE_MAX_G;
  const angle = START_ANGLE + fraction * SWEEP;
  const valueEnd = toXY(angle);
  const valuePath = `M ${trackStart.x} ${trackStart.y} A ${RADIUS} ${RADIUS} 0 ${fraction > 0.5 ? 1 : 0} 1 ${valueEnd.x} ${valueEnd.y}`;

  const isDanger = currentG >= DANGER_G;
  const isWarn = !isDanger && currentG >= WARN_G;

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <div className="relative w-20 h-20 landscape:w-16 landscape:h-16">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <path
            d={TRACK_PATH}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-muted/20"
          />
          <path
            d={valuePath}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={cn(
              'transition-all duration-150',
              isDanger ? 'stroke-destructive' : isWarn ? 'stroke-warning' : 'stroke-accent',
              isDanger && 'animate-pulse',
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-mono font-bold text-lg landscape:text-base leading-none transition-colors',
              isDanger ? 'text-destructive' : isWarn ? 'text-warning' : 'text-foreground',
            )}
          >
            {currentG.toFixed(1)}
          </span>
          <span className="text-[8px] text-muted-foreground uppercase">G</span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        MAX {maxG > 0 ? maxG.toFixed(1) : '0.0'}G
      </div>
    </div>
  );
});
