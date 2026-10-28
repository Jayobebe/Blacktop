import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useHoldTap } from '@/hooks/useHoldTap';
import { armAlarm } from './arm';

/** How long an alarm button has to be held before it arms (the same second as rescue). */
export const ALARM_HOLD_MS = 1000;

/**
 * Every button that arms the anti-theft alarm has to be held for a second,
 * filling as it's held, as every rescue button does: a tap only says so. A
 * bumped button mid-ride paused the ride and locked the screen.
 */
export function useAlarmHold() {
  return useHoldTap(
    () => {
      haptics.tick();
      toast(tr("Hold to arm the alarm"));
    },
    () => {
      haptics.light();
      void armAlarm();
    },
    ALARM_HOLD_MS,
  );
}

/** The fill inside a held alarm button (its parent is `relative overflow-hidden`). */
export function holdFillStyle(holding: boolean) {
  return { height: holding ? '100%' : '0%', transition: holding ? `height ${ALARM_HOLD_MS}ms linear` : 'height 150ms ease-out' };
}
