import { Lock } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { armAlarm } from '../lib/arm';

/**
 * The lock that arms the anti-theft alarm. `home`: a square tile beside the
 * rescue card in the Home header. `ride`: a round control beside the live
 * speed, like the ride screen's other buttons. (The map has its own control,
 * in the map feature.)
 */
export function AlarmButton({ variant, className }: { variant: 'home' | 'ride'; className?: string }) {
  const label = tr("Arm the anti-theft alarm");
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tip="alarm"
      onClick={() => {
        haptics.tick();
        void armAlarm();
      }}
      className={cn(
        'flex items-center justify-center shrink-0 touch-target',
        variant === 'home'
          ? 'pressable h-12 w-12 rounded-2xl border bg-destructive/10 border-destructive/30'
          : 'h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-full transition-all bg-secondary hover:bg-destructive/15',
        className,
      )}
    >
      <Lock className={cn('text-destructive', variant === 'home' ? 'w-[18px] h-[18px]' : 'w-7 h-7 landscape:w-8 landscape:h-8')} />
    </button>
  );
}
