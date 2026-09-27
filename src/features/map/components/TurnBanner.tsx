import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  GitFork,
  Loader2,
  Merge,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortDistance, type DistanceUnit, type NavManeuver, type NavProgress } from '../lib/navigation';

function timeLeft(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function ManeuverIcon({ m, className }: { m: NavManeuver; className?: string }) {
  const mod = m.modifier ?? 'straight';
  if (m.type === 'arrive') return <Flag className={className} />;
  if (m.type === 'roundabout' || m.type === 'rotary' || m.type === 'roundabout turn') {
    // Round the island the way traffic goes: clockwise where they drive on the left.
    return m.side === 'left' ? <RotateCw className={className} /> : <RotateCcw className={className} />;
  }
  if (m.type === 'merge') return <Merge className={cn(className, mod.includes('left') && '-scale-x-100')} />;
  if (m.type === 'fork') return <GitFork className={cn(className, 'rotate-180', mod.includes('left') && '-scale-x-100')} />;
  switch (mod) {
    case 'uturn':
      return <Undo2 className={cn(className, '-rotate-90')} />;
    case 'sharp left':
    case 'left':
      return <CornerUpLeft className={className} />;
    case 'sharp right':
    case 'right':
      return <CornerUpRight className={className} />;
    case 'slight left':
      return <ArrowUpLeft className={className} />;
    case 'slight right':
      return <ArrowUpRight className={className} />;
    default:
      return <ArrowUp className={className} />;
  }
}

interface Props {
  progress: NavProgress | null;
  describe: (m: NavManeuver) => string;
  unit: DistanceUnit;
  arrived: boolean;
  rerouting: boolean;
  destinationName?: string | null;
}

/**
 * Turn-by-turn banner. Takes the search bar's slot at the top of the map while
 * guidance runs (spoken or not, see the Spoken Directions setting): the next
 * manoeuvre, how far to it, what follows straight after, and time/distance left.
 */
export function TurnBanner({ progress, describe, unit, arrived, rerouting, destinationName }: Props) {
  const next = progress?.next ?? null;

  const eta = progress
    ? new Date(Date.now() + progress.remainingSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const left = progress ? shortDistance(progress.remainingMeters, unit) : null;
  const toNext = next ? shortDistance(progress!.distanceToNext, unit) : null;

  return (
    <div className="w-full rounded-xl bg-card/95 border border-accent/60 shadow-xl backdrop-blur overflow-hidden animate-slide-up" role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-12 h-12 rounded-lg bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
          {rerouting ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : arrived ? (
            <Flag className="w-7 h-7" />
          ) : next ? (
            <ManeuverIcon m={next} className="w-7 h-7" />
          ) : (
            <ArrowUp className="w-7 h-7" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {rerouting ? (
            <>
              <p className="text-lg font-black leading-tight">Rerouting…</p>
              <p className="text-xs text-muted-foreground truncate">Finding the way from here</p>
            </>
          ) : arrived ? (
            <>
              <p className="text-lg font-black leading-tight">Arrived</p>
              <p className="text-xs text-muted-foreground truncate">{destinationName || 'Your destination'}</p>
            </>
          ) : next && toNext ? (
            <>
              <p className="text-2xl font-black leading-none tabular-nums">
                {toNext.value}
                <span className="text-sm font-bold text-muted-foreground ml-1">{toNext.unit}</span>
              </p>
              <p className="text-sm font-semibold leading-snug line-clamp-2 mt-0.5">{describe(next)}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-black leading-tight">Follow the route</p>
              <p className="text-xs text-muted-foreground truncate">{destinationName || 'On your way'}</p>
            </>
          )}
        </div>
      </div>

      {!rerouting && !arrived && (progress?.then || left) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/70 bg-background/40 text-xs">
          {progress?.then && (
            <span className="flex items-center gap-1.5 min-w-0 font-medium">
              <span className="text-muted-foreground">Then</span>
              <ManeuverIcon m={progress.then} className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            </span>
          )}
          {left && progress && (
            <span className="ml-auto flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
              <span className="text-foreground font-semibold">{timeLeft(progress.remainingSeconds)}</span>
              · {left.value} {left.unit} · {eta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
