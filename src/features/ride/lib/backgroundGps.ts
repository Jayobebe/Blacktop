import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, CallbackError, Location } from '@capacitor-community/background-geolocation';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';

/**
 * Ride GPS in the native app that keeps going with the screen locked or the app
 * in the background (@capacitor-community/background-geolocation): on Android a
 * location foreground service with a "Ride in progress" notification (so no
 * ACCESS_BACKGROUND_LOCATION), on iOS the `location` background mode (the blue
 * status-bar pill). Only for the length of a ride: the watcher is removed when
 * the ride pauses or ends. Never used on the web.
 */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export const backgroundGpsAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundGeolocation');

export type GpsFix = { lat: number; lng: number; speed: number | null; accuracy: number; time: number };

let warnedOff = false;

/** Starts the ride watcher; resolves to its id (for stopBackgroundGps). */
export function startBackgroundGps(onFix: (fix: GpsFix) => void): Promise<string> {
  return BackgroundGeolocation.addWatcher(
    {
      // Both set: fixes keep coming in the background (Android shows this notification).
      backgroundTitle: tr("Ride in progress"),
      backgroundMessage: tr("Blacktop is tracking your ride. End or pause the ride to stop."),
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (location?: Location, error?: CallbackError) => {
      if (error) {
        if (error.code === 'NOT_AUTHORIZED' && !warnedOff) {
          warnedOff = true;
          toast.error(tr("Location is off for Blacktop"), {
            description: tr("Allow location in your phone's settings to track rides."),
            action: { label: tr("Settings"), onClick: () => void BackgroundGeolocation.openSettings() },
          });
        }
        console.warn('[GPS] Background watcher error:', error.code || error.message);
        return;
      }
      if (!location) return;
      warnedOff = false;
      onFix({
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed,
        accuracy: location.accuracy,
        time: location.time ?? Date.now(),
      });
    },
  );
}

export function stopBackgroundGps(id: string): Promise<void> {
  return BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
}
