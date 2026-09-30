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
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortDistance, type DistanceUnit, type NavManeuver, type NavProgress } from '../lib/navigation';
import { tr } from '@/lib/i18n';

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
  /** No route yet (guidance starts the moment there's a destination). */
  finding?: boolean;
  destinationName?: string | null;
  /** Banner X: stop navigating this route. */
  onStop: () => void;
  /** Convoy leader: skip the stop being navigated to. */
  onSkip?: () => void;
}

/**
 * Turn-by-turn banner. Takes the search bar's slot at the top of the map while
 * guidance runs (spoken or not, see the Spoken Directions setting), and stands
 * in for the destination card: the next manoeuvre and how far to it, what
 * follows straight after, where you're headed and time/distance left.
 */
export function TurnBanner({ progress, describe, unit, arrived, rerouting: reroutingNow, finding = false, destinationName, onStop, onSkip }: Props) {
  // Both show the spinner; only the label differs.
  const rerouting = reroutingNow || finding;
  const next = progress?.next ?? null;

  const eta = progress
    ? new Date(Date.now() + progress.remainingSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const left = progress ? shortDistance(progress.remainingMeters, unit) : null;
  const toNext = next ? shortDistance(progress!.distanceToNext, unit) : null;
  const where = destinationName || 'Destination';

  return (
    <div className="relative w-full rounded-xl bg-card/95 border border-accent/60 shadow-xl backdrop-blur overflow-hidden animate-slide-up" role="status" aria-live="polite">
      <button
        type="button"
        onClick={onStop}
        className="glove-hit absolute top-1.5 right-1.5 w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={tr("Stop navigating")}
        title={tr("Stop navigating")}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-3 pl-3 pr-10 py-2.5">
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
            <p className="text-lg font-black leading-tight">{finding && !reroutingNow ? tr("Finding route…") : tr("Rerouting…")}</p>
          ) : arrived ? (
            <>
              <p className="text-lg font-black leading-tight">{tr("Arrived")}</p>
              <p className="text-xs text-muted-foreground truncate">{where}</p>
            </>
          ) : next && toNext ? (
            <>
              <p className="text-2xl font-black leading-none tabular-nums">
                {toNext.value}
                <span className="text-sm font-bold text-muted-foreground ml-1">{toNext.unit}</span>
              </p>
              <p className="text-sm font-semibold leading-snug line-clamp-2 mt-0.5">{describe(next)}</p>
              {progress?.then && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mt-0.5">
                  {tr("Then")}
                  <ManeuverIcon m={progress.then} className="w-3.5 h-3.5 text-accent" />
                </p>
              )}
            </>
          ) : (
            <p className="text-lg font-black leading-tight">{tr("Follow the route")}</p>
          )}
        </div>
      </div>

      {!arrived && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/70 bg-background/40 text-xs">
          <span className="flex-1 min-w-0 truncate font-semibold">{where}</span>
          {left && progress && !rerouting && (
            <span className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
              <span className="text-foreground font-semibold">{timeLeft(progress.remainingSeconds)}</span>
              {' '}· {left.value} {left.unit} · {eta}
            </span>
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="glove-hit px-3 py-1.5 rounded-md bg-muted hover:bg-secondary text-[11px] font-semibold text-muted-foreground transition-colors flex-shrink-0"
              title={tr("Skip this stop and head for the next")}
            >
              {tr("Skip")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
