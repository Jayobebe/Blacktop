import { useEffect } from 'react';
import { useSettings } from '@/features/settings';
import { subscribeRawFixes } from '@/features/ride/hooks/useActiveRide';
import { onHazardFix } from '@/features/hazards/lib/position';
import { clearSpeedLimit, feedSpeedLimitFix } from '@/lib/speedLimit';

/** No fix for this long: the limit shown is stale, so it goes. */
const STALE_MS = 15_000;

/**
 * Feeds the speed limit lookup (lib/speedLimit) from the ride's GPS, or the
 * map's when there's no ride (it hands its fixes to the hazard warnings the
 * same way), only while the rider has the live speed on. Mounted once in App;
 * it renders nothing.
 */
export function SpeedLimitFeed() {
  const { settings } = useSettings();
  const on = settings.speedFocusEnabled;
  useEffect(() => {
    if (!on) {
      clearSpeedLimit();
      return;
    }
    let stale = 0;
    const onFix = (lat: number, lng: number, speed: number | null) => {
      feedSpeedLimitFix(lat, lng, speed);
      clearTimeout(stale);
      stale = window.setTimeout(clearSpeedLimit, STALE_MS);
    };
    const offRide = subscribeRawFixes((f) => onFix(f.lat, f.lng, f.speed));
    const offMap = onHazardFix((f) => onFix(f.lat, f.lng, f.speed));
    return () => {
      offRide();
      offMap();
      clearTimeout(stale);
    };
  }, [on]);
  return null;
}
