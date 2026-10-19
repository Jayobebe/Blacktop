import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useHoldTap } from '@/hooks/useHoldTap';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useDiscordIntegration } from '@/features/integrations/discord';
import { useRescueBridge } from '../lib/rescueBridge';
import { sendSoloRescueHere } from '../lib/soloRescue';
import { CrashCheckPrompt } from './CrashCheckPrompt';

/** How long the R has to be held before it asks. */
const HOLD_MS = 1000;

/**
 * The map's rescue button (the Home map and a ride's map): a small burn-orange R
 * at the end of the toolbar row, away from Report and the close button, the
 * controls that get pressed mid-ride. It has to be held for a second (filling up
 * as it's held; a tap only says so), and then asks "Are you okay?" like every
 * rescue button: nothing goes unless Send rescue is pressed.
 *
 * In a convoy it sends the convoy's call through the rescue bridge (useRescue,
 * owned by the ride screen under the map); a call already out is cancelled with
 * a tap, as on the ride screen. Otherwise (a solo ride, or the Home map) it's
 * the solo call from where the phone is. A convoy's leader has none, as on the
 * ride screen.
 */
export function MapRescueButton({ isLeader = false }: { isLeader?: boolean }) {
  const bridge = useRescueBridge();
  const { settings } = useSettings();
  const { profile } = useProfile();
  const { integration } = useDiscordIntegration();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const inConvoy = bridge.canRequest;
  const pending = inConvoy ? bridge.hasPending : sent;

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
      if (pending || busy) return;
      setAsking(true);
    },
    HOLD_MS,
  );

  if (inConvoy && isLeader) return null;

  const send = async () => {
    if (inConvoy) {
      await bridge.send?.();
      return;
    }
    setBusy(true);
    try {
      const discordEnabled = !!integration?.webhook_url && integration.auto_announce !== false;
      if (await sendSoloRescueHere({ settings, discordEnabled, riderName: profile.name || '' })) {
        setSent(true);
        window.setTimeout(() => setSent(false), 30000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        {...handlers}
        aria-label={pending ? (inConvoy ? tr("Cancel rescue request") : tr("Rescue call sent")) : tr("Request rescue")}
        data-tip="map-rescue"
        className={cn(
          'hold-target glove-hit relative overflow-hidden w-[38px] h-[38px] landscape:w-[34px] landscape:h-[34px] shrink-0 rounded-full flex items-center justify-center bg-[hsl(var(--burn))] text-white shadow-lg border border-white/15',
          pending && 'animate-pulse ring-4 ring-[hsl(var(--burn)/0.4)]',
        )}
      >
        {/* The hold, filling from the bottom. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-white/35 pointer-events-none"
          style={{ height: holding ? '100%' : '0%', transition: holding ? `height ${HOLD_MS}ms linear` : 'height 150ms ease-out' }}
        />
        <span aria-hidden className="relative text-base landscape:text-sm font-black leading-none">R</span>
      </button>
      {asking &&
        createPortal(
          <CrashCheckPrompt
            manual
            timeoutSec={20}
            onImFine={() => setAsking(false)}
            onTimeout={() => setAsking(false)}
            onSendNow={() => {
              setAsking(false);
              void send();
            }}
          />,
          document.body,
        )}
    </>
  );
}
