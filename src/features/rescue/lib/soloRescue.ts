import { announceSoloRescueToDiscord } from '@/features/integrations/discord';
import { notifyRescue } from '@/features/notifications';
import type { AppSettings } from '@/features/settings';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { rescueReach } from './reach';
import { emergencyTextAction } from './emergencyText';

/**
 * A rescue call from a rider who isn't in a convoy (a solo ride, or Home with no
 * ride at all): Discord when it's connected, plus a push to their crew and, if
 * they chose it, riders nearby. Settings → Safety decides who hears it. Returns
 * who was told, in words for the toast.
 */
export async function sendSoloRescue(args: {
  settings: AppSettings;
  discordEnabled: boolean;
  riderName: string;
  lat: number;
  lng: number;
  auto?: boolean;
}): Promise<string[]> {
  const { settings, discordEnabled, riderName, lat, lng, auto = false } = args;
  const reach = rescueReach(settings);
  const [discord, push] = await Promise.all([
    discordEnabled && reach.discord
      ? announceSoloRescueToDiscord({ riderName: riderName || 'Rider', lat, lng })
      : Promise.resolve({ ok: false, skipped: true }),
    reach.crew || reach.nearbyKm
      ? notifyRescue({ lat, lng, auto, crewCode: reach.crew ? undefined : null, nearbyKm: reach.nearbyKm })
      : Promise.resolve({ sent: 0 }),
  ]);
  return [
    discord.ok ? 'Discord' : null,
    push.sent ? (reach.nearbyKm ? (reach.crew ? 'your crew and riders nearby' : 'riders nearby') : 'your crew') : null,
  ].filter((x): x is string => !!x);
}

/**
 * A solo rescue call from wherever the phone is now (no ride needed): the
 * position, the call, and a toast saying who heard it, with the emergency
 * contact's text offered whatever the server managed. Returns whether anyone
 * was told. Used by the Home safety card and the map's rescue button.
 */
export async function sendSoloRescueHere(args: { settings: AppSettings; discordEnabled: boolean; riderName: string }): Promise<boolean> {
  const { settings, discordEnabled, riderName } = args;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 });
    });
    const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const told = await sendSoloRescue({ settings, discordEnabled, riderName, lat: at.lat, lng: at.lng });
    const text = emergencyTextAction(settings, riderName, at);
    if (told.length) {
      toast.success(tr("Rescue call sent to {0}", [told.join(' and ')]), { action: text, duration: text ? 15000 : undefined });
      return true;
    }
    toast.error(tr("Nobody to alert yet"), {
      description: tr("Connect Discord in Settings, or ask your crew to turn on notifications."),
      action: text,
      duration: text ? 15000 : undefined,
    });
  } catch (err) {
    console.error('[SoloRescue]', err);
    const text = emergencyTextAction(settings, riderName, null);
    toast.error(tr("Could not get your location"), { action: text, duration: text ? 15000 : undefined });
  }
  return false;
}
