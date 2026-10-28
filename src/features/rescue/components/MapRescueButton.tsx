import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useHoldTap } from '@/hooks/useHoldTap';
import { useRescueBridge } from '../lib/rescueBridge';
import { askRescue, useRescueAsk } from '../lib/askStore';

/** How long the R has to be held before it asks. */
export const RESCUE_HOLD_MS = 1000;

/**
 * The map's rescue button (the Home map and a ride's map): a burn-orange R in the
 * right-hand column under recentre (`control`; the alarm's siren has its old place
 * under the toolbar), away from Report and the close button, the controls that
 * get pressed mid-ride. It has to be held for a second (filling up
 * as it's held; a tap only says so), and then asks "Are you okay?" like every
 * rescue button (RescueAskHost, which sends it): nothing goes unless Send rescue
 * is pressed. In a convoy a call already out is cancelled with a tap, as on the
 * ride screen. A convoy's leader has none, as on the ride screen.
 */
export function MapRescueButton({ isLeader = false, control = false }: { isLeader?: boolean; /** In the map's right-hand column: a full 48 px button like the controls round it. */ control?: boolean }) {
  const bridge = useRescueBridge();
  const { recentlySent } = useRescueAsk();
  const inConvoy = bridge.canRequest;
  const pending = inConvoy ? bridge.hasPending : recentlySent;

  const { holding, handlers } = useHoldTap(
    () => {
      if (pending && inConvoy) {
        void bridge.cancel?.();
        return;
      }
      haptics.tick();
      toast(tr("Hold the R to call for rescue"));
    },
    () => {
      if (!pending) askRescue();
    },
    RESCUE_HOLD_MS,
  );

  if (inConvoy && isLeader) return null;

  return (
    <button
      type="button"
      {...handlers}
      aria-label={pending ? (inConvoy ? tr("Cancel rescue request") : tr("Rescue call sent")) : tr("Request rescue")}
      data-tip="map-rescue"
      className={cn(
        'hold-target relative overflow-hidden shrink-0 flex items-center justify-center bg-[hsl(var(--burn))] text-white',
        control ? 'w-12 h-12 rounded-[inherit]' : 'glove-hit w-[38px] h-[38px] landscape:w-[34px] landscape:h-[34px] rounded-xl shadow-lg border border-white/15',
        pending && 'animate-pulse ring-4 ring-[hsl(var(--burn)/0.4)]',
      )}
    >
      {/* The hold, filling from the bottom. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-white/35 pointer-events-none"
        style={{ height: holding ? '100%' : '0%', transition: holding ? `height ${RESCUE_HOLD_MS}ms linear` : 'height 150ms ease-out' }}
      />
      <span aria-hidden className={cn('relative font-black leading-none', control ? 'text-lg' : 'text-base landscape:text-sm')}>R</span>
    </button>
  );
}
