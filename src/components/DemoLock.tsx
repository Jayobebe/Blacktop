import { Lock } from 'lucide-react';
import { useDemoMode } from '@/lib/demoMode';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * Demo mode keeps the demo rider away from real people: every QR scanner and
 * code entry (crews, convoys, pit crew, arcade lobbies, cards, logbook
 * hand-over, wallets, Enterprise codes) is dead while it's on, so nothing a
 * demo account does can land in a real crew, convoy or lobby. Controls are
 * disabled with this note under them, and their handlers check demoBlocked()
 * as well, for deep links and anything already open.
 */
export const useDemoLocked = (): boolean => useDemoMode().enabled;

export function DemoLockNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start justify-center gap-1.5 text-[11px] text-muted-foreground text-center', className)}>
      <Lock className="w-3.5 h-3.5 shrink-0 mt-px text-accent" aria-hidden />
      <span>{tr("Scanning and codes are off in demo mode. Turn demo mode off in Settings to use them.")}</span>
    </p>
  );
}
