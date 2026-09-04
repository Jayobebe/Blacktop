import { useCallback, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Trophy, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BADGE_ORDER, BADGE_INFO } from '@/types/convoy';
import { badgeWallet, spendBadgesForCopy, BADGES_PER_COPY } from '../lib/badgeWallet';

function subscribe(cb: () => void) {
  window.addEventListener('blacktop-badges', cb);
  return () => window.removeEventListener('blacktop-badges', cb);
}

/** Badge collection + the badges-for-card-copies economy. */
export function BadgeWalletPanel() {
  const wallet = useSyncExternalStore(subscribe, () => JSON.stringify(badgeWallet()));
  const w = JSON.parse(wallet) as ReturnType<typeof badgeWallet>;

  const trade = useCallback(() => {
    if (spendBadgesForCopy()) {
      toast.success('Card copy unlocked', {
        description: `${BADGES_PER_COPY} badges traded — drop it on the map.`,
      });
    } else {
      toast('Not enough badges', {
        description: `${BADGES_PER_COPY} badge points buys one card copy.`,
      });
    }
  }, []);

  const pct = Math.min(100, (w.balance / BADGES_PER_COPY) * 100);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 landscape:mb-2">
        <Trophy className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">Badges</h2>
        <span className="ml-auto text-xs text-muted-foreground">{w.balance} pts banked</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BADGE_ORDER.filter(t => t !== 'fallback').map((type, index) => {
          const info = BADGE_INFO[type];
          const count = w.counts[type] || 0;
          const negative = info.points < 0;
          return (
            <div
              key={type}
              className={cn(
                'flex flex-col items-center p-3 rounded-2xl border transition-all animate-scale-in text-center',
                negative
                  ? 'bg-stone-500/10 border-stone-500/30'
                  : 'bg-accent/10 border-accent/30',
                count === 0 && 'opacity-50'
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="text-2xl mb-1">{info.emoji}</span>
              <span
                className={cn(
                  'font-mono text-xl font-bold',
                  negative ? 'text-stone-400' : 'text-accent'
                )}
              >
                {count}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium mt-0.5',
                  negative ? 'text-stone-400' : 'text-accent'
                )}
              >
                {info.label}
              </span>
              <span className="text-[9px] text-muted-foreground mt-0.5">
                {negative ? '−1 pt' : '+1 pt'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Economy */}
      <div className="mt-3 rounded-2xl border border-border/30 bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <p className="text-xs font-semibold">Trade badges for a card copy</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {BADGES_PER_COPY} badge points buys one spare copy of your trading card to plant on the
          Blacktop map. Fallback costs you a point. Every card of yours that another rider collects
          earns you a kickback point. Traded copies never count against the monthly copy cap.
        </p>
        {w.kickbacks > 0 && (
          <p className="text-[11px] text-accent mt-1.5">🔁 {w.kickbacks} kickback pt{w.kickbacks === 1 ? '' : 's'} from collected drops</p>
        )}
        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-3">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {w.balance}/{BADGES_PER_COPY}
            {w.spent > 0 && ` · ${w.spent} spent`}
          </span>
          <button
            type="button"
            onClick={trade}
            disabled={w.balance < BADGES_PER_COPY}
            aria-label="Trade badges for a card copy"
            className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-accent/50 text-accent disabled:opacity-40 disabled:border-border/40 disabled:text-muted-foreground transition-colors"
          >
            Trade {BADGES_PER_COPY}
          </button>
        </div>
      </div>
    </div>
  );
}
