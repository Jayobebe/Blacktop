import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PriceInfo } from '@/lib/priceLevel';

/**
 * How dear a place is next to its kind: five currency signs with the first
 * `level` lit (half of one at .5), or Free.
 */
export function PriceSigns({ info, sign, className }: { info: PriceInfo; sign: string; className?: string }) {
  if ('free' in info) return <span className={cn('font-semibold text-emerald-400', className)}>{tr("Free")}</span>;
  const label = tr("Price level {0} of 5", [info.level]);
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex font-semibold leading-none', className)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, info.level - i));
        return fill > 0 && fill < 1 ? (
          <span
            key={i}
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground) / 0.35) 50%)' }}
          >
            {sign}
          </span>
        ) : (
          <span key={i} className={fill >= 1 ? 'text-foreground' : 'text-muted-foreground/35'}>
            {sign}
          </span>
        );
      })}
    </span>
  );
}
