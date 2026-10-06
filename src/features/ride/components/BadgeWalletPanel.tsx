import { useCallback, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Trophy, Sparkles, Gauge, Route, Bike, Orbit, Spline, Moon, Armchair, CalendarDays, Anchor, Repeat, type LucideIcon } from 'lucide-react';
import { getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BADGE_ORDER, BADGE_INFO, type BadgeType } from '@/types/convoy';
import { badgeWallet, spendBadgesForCopy, BADGES_PER_COPY } from '../lib/badgeWallet';
import { useSettings } from '@/features/settings';
import { useExperience, badgeVisible } from '@/features/experience';
import { isDemoModeActive, useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';

function subscribe(cb: () => void) {
  window.addEventListener('blacktop-badges', cb);
  return () => window.removeEventListener('blacktop-badges', cb);
}

/** Each badge's icon, in the app's own line style (the emoji stay for receipts). */
const BADGE_ICON: Record<BadgeType, LucideIcon> = {
  'speed-demon': Gauge,
  journeyman: Route,
  'lean-fiend': Bike,
  'g-lock': Orbit,
  'corner-carver': Spline,
  'night-owl': Moon,
  'hard-ass': Armchair,
  'always-out': CalendarDays,
  fallback: Anchor,
};

/** How a badge is earned, on the back of its box (so it's short). The long-haul distance is in the rider's units. */
function howToEarn(type: BadgeType | 'kickback', longHaul: string): string {
  switch (type) {
    case 'speed-demon':
      return tr("Set the highest top speed in a convoy.");
    case 'journeyman':
      return tr("Cover the most distance in a convoy.");
    case 'lean-fiend':
      return tr("Lean further than anyone else in a convoy.");
    case 'g-lock':
      return tr("Pull the highest G-force in a convoy.");
    case 'corner-carver':
      return tr("Score the best corners in a convoy.");
    case 'night-owl':
      return tr("Set off between 20:00 and 05:00.");
    case 'hard-ass':
      return tr("Cover {0} or more in one go.", [longHaul]);
    case 'always-out':
      return tr("Head out three times in one day.");
    case 'fallback':
      return tr("Spend the longest standing still in a convoy.");
    case 'kickback':
      return tr("Another rider collects one of the cards you dropped on the map.");
  }
}

/**
 * A badge's box: tapped, it turns over to say how the badge is earned, and
 * back again. Both faces share one grid cell, so the box is as tall as the
 * taller of them and never jumps.
 */
function FlipBox({
  flipped,
  onFlip,
  label,
  className,
  face,
  style,
  front,
  back,
}: {
  flipped: boolean;
  onFlip: () => void;
  label: string;
  className?: string;
  /** Fill, border and padding: on the faces, so they turn with the box. */
  face: string;
  style?: React.CSSProperties;
  front: React.ReactNode;
  back: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onFlip} aria-pressed={flipped} aria-label={label} className={cn('badge-flip pressable animate-scale-in', className)} style={style}>
      <span className={cn('badge-flip-inner', flipped && 'is-flipped')}>
        <span className={cn('badge-face no-frost rounded-2xl border', face)}>{front}</span>
        <span className={cn('badge-face badge-back no-frost rounded-2xl border flex items-center justify-center text-center', face)} aria-hidden={!flipped}>
          <span className="text-[10px] leading-snug text-foreground/90">{back}</span>
        </span>
      </span>
    </button>
  );
}

/** Badge collection + the badges-for-card-copies economy. */
export function BadgeWalletPanel() {
  useDemoMode(); // re-read the wallet when demo mode flips
  const wallet = useSyncExternalStore(subscribe, () => JSON.stringify(badgeWallet()));
  const w = JSON.parse(wallet) as ReturnType<typeof badgeWallet>;
  const { settings } = useSettings();
  const { canLean } = useExperience();
  // One box turned over at a time.
  const [open, setOpen] = useState<BadgeType | 'kickback' | null>(null);
  const flip = (type: BadgeType | 'kickback') => setOpen((o) => (o === type ? null : type));
  const longHaul = `${settings.distanceUnit === 'km' ? 241 : 150} ${getDistanceLabel(settings.distanceUnit)}`;
  // Card copies are of your own garage card and get dropped on the World map.
  const cardEconomy = settings.garageEnabled && settings.blacktopWorldEnabled;
  const vis = { speed: settings.speedFocusEnabled, lean: canLean && settings.leanAngleEnabled, g: settings.gForceEnabled };

  const trade = useCallback(() => {
    if (isDemoModeActive()) {
      toast(tr("Trading is off in demo mode"));
      return;
    }
    if (spendBadgesForCopy()) {
      toast.success(tr("Card copy unlocked"), {
        description: tr("{0} badges traded — drop it on the map.", [BADGES_PER_COPY]),
      });
    } else {
      toast(tr("Not enough badges"), {
        description: tr("{0} badge points buys one card copy.", [BADGES_PER_COPY]),
      });
    }
  }, []);

  const pct = Math.min(100, (w.balance / BADGES_PER_COPY) * 100);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 landscape:mb-2">
        <Trophy className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">{tr("Badges")}</h2>
        {cardEconomy && <span className="ml-auto text-xs text-muted-foreground">{w.balance}{" "}{tr("pts banked")}</span>}
      </div>

      {/* Three per row; a partial last row is centred (the visible set depends on the rider's setup). */}
      <div className="flex flex-wrap justify-center gap-2">
        {BADGE_ORDER.filter(t => t !== 'fallback' && badgeVisible(t, vis)).map((type, index) => {
          const info = BADGE_INFO[type];
          const count = w.counts[type] || 0;
          const negative = info.points < 0;
          const Icon = BADGE_ICON[type];
          return (
            <FlipBox
              key={type}
              flipped={open === type}
              onFlip={() => flip(type)}
              label={tr("{0}: how to earn it", [info.label])}
              className={cn('basis-[calc((100%-1rem)/3)]', count === 0 && open !== type && 'opacity-60')}
              face={cn('p-3', negative ? 'bg-stone-900/80 border-stone-500/30' : count > 0 ? 'bg-accent/10 border-accent/30' : 'bg-card border-white/[0.06]')}
              style={{ animationDelay: `${index * 50}ms` }}
              front={
                <span className="flex flex-col items-center text-center">
                  <Icon className={cn('w-6 h-6 mb-1.5', negative ? 'text-stone-400' : 'text-accent-2')} />
                  <span className="font-mono text-xl font-bold text-foreground">{count}</span>
                  <span className="text-[10px] font-medium mt-0.5 text-muted-foreground">{info.label}</span>
                  {cardEconomy && <span className="text-[9px] text-muted-foreground/70 mt-0.5">{negative ? tr("−1 pt") : tr("+1 pt")}</span>}
                </span>
              }
              back={howToEarn(type, longHaul)}
            />
          );
        })}

        {/* Kickback — earned when another rider collects one of your drops */}
        {cardEconomy && (
          <FlipBox
            flipped={open === 'kickback'}
            onFlip={() => flip('kickback')}
            label={tr("{0}: how to earn it", [tr("Kickback")])}
            className={cn('basis-[calc((100%-1rem)/3)]', w.kickbacks === 0 && open !== 'kickback' && 'opacity-60')}
            face={cn('p-3', w.kickbacks > 0 ? 'bg-accent/10 border-accent/30' : 'bg-card border-white/[0.06]')}
            style={{ animationDelay: `${8 * 50}ms` }}
            front={
              <span className="flex flex-col items-center text-center">
                <Repeat className="w-6 h-6 mb-1.5 text-accent-2" />
                <span className="font-mono text-xl font-bold text-foreground">{w.kickbacks}</span>
                <span className="text-[10px] font-medium mt-0.5 text-muted-foreground">{tr("Kickback")}</span>
                <span className="text-[9px] text-muted-foreground/70 mt-0.5">{tr("+1 pt")}</span>
              </span>
            }
            back={howToEarn('kickback', longHaul)}
          />
        )}
      </div>

      {/* Fallback — full width, deducts from the total */}
      {(() => {
        const info = BADGE_INFO.fallback;
        const count = w.counts.fallback || 0;
        return (
          <FlipBox
            flipped={open === 'fallback'}
            onFlip={() => flip('fallback')}
            label={tr("{0}: how to earn it", [info.label])}
            className={cn('mt-2 w-full', count === 0 && open !== 'fallback' && 'opacity-60')}
            face="p-3 bg-stone-900/80 border-stone-500/30"
            style={{ animationDelay: `${9 * 50}ms` }}
            front={
              <span className="flex items-center gap-3 text-left">
                <Anchor className="w-6 h-6 text-stone-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] font-medium text-muted-foreground">{info.label}</span>
                  {cardEconomy && <span className="block text-[9px] text-muted-foreground/70 mt-0.5">{tr("−1 pt")}</span>}
                </span>
                <span className="font-mono text-xl font-bold text-foreground">{count}</span>
              </span>
            }
            back={howToEarn('fallback', longHaul)}
          />
        );
      })()}

      {/* Economy */}
      {cardEconomy && (
      <div className="mt-3 rounded-2xl border border-border/30 bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <p className="text-xs font-semibold">{tr("Trade badges for a card copy")}</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {BADGES_PER_COPY}{" "}{tr("badge points buys one spare copy of your trading card to plant on the Blacktop map. Fallback costs you a point. Every card of yours that another rider collects earns you a kickback point. Traded copies never count against the monthly copy cap.")}
        </p>
        {w.kickbacks > 0 && (
          <p className="text-[11px] text-accent mt-1.5">{w.kickbacks === 1 ? tr("1 kickback pt from collected drops") : tr("{0} kickback pts from collected drops", [w.kickbacks])}</p>
        )}
        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-3">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {w.balance}/{BADGES_PER_COPY}
            {w.spent > 0 && tr(" · {0} spent", [w.spent])}
          </span>
          <button
            type="button"
            onClick={trade}
            disabled={w.balance < BADGES_PER_COPY}
            aria-label={tr("Trade badges for a card copy")}
            className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-accent/50 text-accent disabled:opacity-40 disabled:border-border/40 disabled:text-muted-foreground transition-colors"
          >
            {tr("Trade")}{" "}{BADGES_PER_COPY}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
