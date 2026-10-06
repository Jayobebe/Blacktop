import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { showRpm } from '../lib/rules';

/** The player's RPM, Card Wars' currency (the server holds it). */
export function RpmPill({ balance, className }: { balance: number | null; className?: string }) {
  return (
    <span className={cn('cw-rpm font-mono', className)} aria-label={tr("{0} RPM", [showRpm(balance ?? 0)])}>
      <Coins aria-hidden />
      <b key={balance ?? -1}>{balance === null ? '—' : showRpm(balance)}</b>
      <small>RPM</small>
    </span>
  );
}
