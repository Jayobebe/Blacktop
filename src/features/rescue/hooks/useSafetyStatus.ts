import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useSettings } from '@/features/settings';

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown';
export type SafetyLevel = 'active' | 'off' | 'permissions';

const isNative = Capacitor.isNativePlatform();

async function readLocationPermission(): Promise<LocationPermission> {
  try {
    if (isNative) {
      const { location } = await Geolocation.checkPermissions();
      return location === 'granted' ? 'granted' : location === 'denied' ? 'denied' : 'prompt';
    }
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/**
 * Whether crash rescue will actually work if the rider goes down right now:
 * - active: auto-rescue on and location granted (or not checkable)
 * - off: auto-rescue switched off
 * - permissions: auto-rescue on but location isn't granted, so no position to send
 */
export function useSafetyStatus() {
  const { settings } = useSettings();
  const [location, setLocation] = useState<LocationPermission>('unknown');

  const refresh = useCallback(async () => {
    setLocation(await readLocationPermission());
  }, []);

  useEffect(() => {
    refresh();

    // Web: follow live changes (e.g. user flips it in site settings).
    let status: PermissionStatus | null = null;
    if (!isNative && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((s) => {
          status = s;
          s.onchange = () => setLocation(s.state);
        })
        .catch(() => {});
    }

    // Native: permissions are changed in the OS settings app, so re-check on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (status) status.onchange = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const requestLocation = useCallback(async () => {
    try {
      if (isNative) {
        await Geolocation.requestPermissions();
      } else {
        await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
        );
      }
    } catch {
      // Denied or timed out — the re-read below reflects it.
    }
    await refresh();
  }, [refresh]);

  const level: SafetyLevel = !settings.autoRescueEnabled
    ? 'off'
    : location === 'denied' || location === 'prompt'
    ? 'permissions'
    : 'active';

  return { level, location, autoRescueEnabled: settings.autoRescueEnabled, requestLocation, refresh };
}
