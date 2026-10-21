import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/** A small "Beta" label beside a feature that hasn't been proven on real rides yet (Crash check). */
export function BetaPill({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center h-4 px-1.5 rounded-md border border-current/40 text-[9px] font-bold uppercase tracking-wider align-middle opacity-80', className)}>
      {tr("Beta")}
    </span>
  );
}
