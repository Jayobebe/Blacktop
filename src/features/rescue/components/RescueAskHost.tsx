import { createPortal } from 'react-dom';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useDiscordIntegration } from '@/features/integrations/discord';
import { useRescueBridge } from '../lib/rescueBridge';
import { sendSoloRescueHere } from '../lib/soloRescue';
import { useRescueAsk, closeRescueAsk, markRescueSent } from '../lib/askStore';
import { CrashCheckPrompt } from './CrashCheckPrompt';

/**
 * The "Are you okay?" card for a rescue asked for away from the ride screen
 * (lib/askStore): portaled to body, above everything. Send rescue goes to the
 * convoy (the rescue bridge, owned by the ride screen) when in one, otherwise
 * it's the solo call from where the phone is. I'm okay, or no answer in 20 s,
 * sends nothing.
 */
export function RescueAskHost() {
  const { asking } = useRescueAsk();
  const bridge = useRescueBridge();
  const { settings } = useSettings();
  const { profile } = useProfile();
  const { integration } = useDiscordIntegration();
  if (!asking) return null;

  const send = async () => {
    if (bridge.canRequest) {
      await bridge.send?.();
      return;
    }
    const discordEnabled = !!integration?.webhook_url && integration.auto_announce !== false;
    if (await sendSoloRescueHere({ settings, discordEnabled, riderName: profile.name || '' })) markRescueSent();
  };

  return createPortal(
    <CrashCheckPrompt
      manual
      timeoutSec={20}
      onImFine={closeRescueAsk}
      onTimeout={closeRescueAsk}
      onSendNow={() => {
        closeRescueAsk();
        void send();
      }}
    />,
    document.body,
  );
}
