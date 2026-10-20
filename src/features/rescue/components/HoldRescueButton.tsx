import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useHoldTap } from '@/hooks/useHoldTap';
import { RESCUE_HOLD_MS } from './MapRescueButton';

/**
 * Every rescue button a rider presses by hand (the ride screen's R, the
 * passenger screen's, the Home safety sheet's; the map's R and Blacktop
 * Console's action work the same way): it has to be held for a second, filling
 * as it's held, before it even asks "Are you okay?". A tap only says so, or,
 * with a call already out, does `onTap` (cancelling it). Buttons in a pocket or
 * under a glove were being pressed by accident.
 */
export function HoldRescueButton({
  onHeld,
  onTap,
  disabled,
  className,
  fill = 'bg-white/35',
  title,
  dataTip,
  children,
}: {
  /** Held for the full second: ask "Are you okay?". */
  onHeld: () => void;
  /** A tap instead (a call already out: cancel it). Left out, a tap says to hold. */
  onTap?: () => void;
  disabled?: boolean;
  className?: string;
  /** The colour that fills it while held. */
  fill?: string;
  title?: string;
  dataTip?: string;
  children: ReactNode;
}) {
  const { holding, handlers } = useHoldTap(
    () => {
      if (onTap) return onTap();
      haptics.tick();
      toast(tr("Hold the R to call for rescue"));
    },
    () => {
      if (!disabled) onHeld();
    },
    RESCUE_HOLD_MS,
  );
  return (
    <button
      type="button"
      {...(disabled ? {} : handlers)}
      aria-disabled={disabled || undefined}
      aria-label={title}
      title={title}
      data-tip={dataTip}
      className={cn('hold-target relative overflow-hidden', className)}
    >
      {/* The hold, filling from the bottom. */}
      <span
        aria-hidden
        className={cn('absolute inset-x-0 bottom-0 pointer-events-none', fill)}
        style={{ height: holding ? '100%' : '0%', transition: holding ? `height ${RESCUE_HOLD_MS}ms linear` : 'height 150ms ease-out' }}
      />
      <span className="relative inline-flex items-center justify-center">{children}</span>
    </button>
  );
}
