import { TrendingDown, TrendingUp } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * A steel coin in the air: it lands best side up (heads) or worst (tails).
 * The Coin flip dog tag tosses one over the table (`side` rings it in the
 * player's or the rival's colour); the Marketplace tosses one for a sale.
 */
export function Coin({ heads, side, className }: { heads: boolean; side?: 'mine' | 'theirs'; className?: string }) {
  return (
    <span className={cn('cw-coin', heads ? 'cw-coin-heads' : 'cw-coin-tails', side && `cw-coin-${side}`, className)} role="img" aria-label={heads ? tr("Heads") : tr("Tails")}>
      <span className="cw-coin-in">
        <i className="cw-coin-face cw-coin-h">
          <TrendingUp aria-hidden />
        </i>
        <i className="cw-coin-face cw-coin-t">
          <TrendingDown aria-hidden />
        </i>
      </span>
    </span>
  );
}
