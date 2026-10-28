import { Siren } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { holdFillStyle, useAlarmHold } from '../lib/useAlarmHold';

/**
 * The siren that arms the anti-theft alarm, held for a second to arm (a tap only
 * says so). `ride`: in the ride screen's controls, like its other buttons.
 * `map`: the map's small burn-orange square under the toolbar (where the rescue
 * R was; the R is in the right-hand column). `home`: a 48 px tile.
 */
export function AlarmButton({ variant, className }: { variant: 'home' | 'ride' | 'map'; className?: string }) {
  const label = tr("Hold to arm the anti-theft alarm");
  const { holding, handlers } = useAlarmHold();
  return (
    <button
      type="button"
      {...handlers}
      aria-label={label}
      title={label}
      data-tip={variant === 'map' ? 'map-alarm' : 'alarm'}
      className={cn(
        'hold-target relative overflow-hidden flex items-center justify-center shrink-0',
        variant === 'home'
          ? 'touch-target pressable h-12 w-12 rounded-2xl border bg-[hsl(var(--burn)/0.1)] border-[hsl(var(--burn)/0.35)]'
          : variant === 'map'
            ? 'glove-hit w-[38px] h-[38px] landscape:w-[34px] landscape:h-[34px] rounded-xl bg-card/95 border border-border shadow-lg backdrop-blur'
            : 'touch-target h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl transition-all bg-secondary hover:bg-[hsl(var(--burn)/0.15)]',
        className,
      )}
    >
      {/* The hold, filling from the bottom. */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 bg-[hsl(var(--burn)/0.35)] pointer-events-none" style={holdFillStyle(holding)} />
      <Siren
        className={cn(
          'relative text-[hsl(var(--burn))]',
          variant === 'home' ? 'w-[18px] h-[18px]' : variant === 'map' ? 'w-[18px] h-[18px] landscape:w-4 landscape:h-4' : 'w-7 h-7 landscape:w-8 landscape:h-8',
        )}
      />
    </button>
  );
}
