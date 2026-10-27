import { Wind, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { metresText, windText } from '@/lib/units';
import { setWindWarning, useWindWarning, windColour, type WindWarning } from '../lib/windWarning';
import { useMapOverlay } from '../hooks/useMapOverlay';
import { useHazardWarning } from '@/features/hazards/lib/bannerStore';

/** A side-wind warning ahead (map/lib/windRoute), in the hazard banner's look. */
export function WindBanner({ warning, className }: { warning: WindWarning; className?: string }) {
  const colour = windColour(warning.level);
  const title = warning.level === 'strong' ? tr("Strong side gusts ahead") : tr("Side gusts ahead");
  const gust = windText(warning.crossKmh);
  const detail =
    warning.side === 'left'
      ? tr("{0} from the left · {1}", [gust, metresText(warning.distance)])
      : tr("{0} from the right · {1}", [gust, metresText(warning.distance)]);
  return (
    <div role="alert" className={cn('animate-slide-up', className)}>
      <div className="flex items-center gap-3 rounded-2xl border-2 bg-card/95 backdrop-blur px-3 py-2.5 shadow-2xl" style={{ borderColor: colour }}>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: colour }}>
          <Wind className="w-5 h-5 text-white" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight truncate">{title}</span>
          <span className="block text-xs text-muted-foreground truncate">{detail}</span>
        </span>
        <button onClick={() => setWindWarning(null)} className="glove-hit p-1.5 text-muted-foreground" aria-label={tr("Dismiss")}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** The warning on top of whatever's on screen while the map is closed (mounted once in App); the map shows its own. */
export function WindAlertHost() {
  const warning = useWindWarning();
  const { isOpen } = useMapOverlay();
  const hazard = useHazardWarning();
  if (!warning || isOpen) return null;
  // Under a hazard warning when both are up (the hazard's banner sits where this one would).
  return (
    <div className={cn('fixed left-1/2 -translate-x-1/2 z-[1300] w-[min(24rem,calc(100%-1.5rem))]', hazard ? 'top-[calc(var(--safe-top)+9.5rem)]' : 'top-[calc(var(--safe-top)+4.75rem)]')}>
      <WindBanner warning={warning} />
    </div>
  );
}
