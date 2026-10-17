import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { cannotLockScreen, lockScreen, unlockScreen } from '@/lib/orientationLock';

/** Moving this fast or more holds the screen (the same line max lean counts from). */
const LOCK_MPH = 6;
/** Below this for UNLOCK_AFTER_MS lets it go: a stop, not a slow corner or stop-start traffic. */
const UNLOCK_MPH = 3;
const UNLOCK_AFTER_MS = 5000;
const IOS_TIP_KEY = 'blacktop_rotation_tip';

/**
 * Leaning the bike can turn the phone far enough for the screen to swap
 * between portrait and landscape mid-corner. During a ride, at 6 mph (about
 * 10 km/h) or more, the screen is held the way it is; it's let go after five
 * seconds below 3 mph, and straight away when the ride is paused or ends
 * (lib/orientationLock: the Android app always, an installed web app on
 * Android usually, never on iOS, where a one-time tip suggests Rotation Lock).
 */
export function useRideOrientationLock(active: boolean, paused: boolean, speedMph: number) {
  const locked = useRef(false);
  const slowSince = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  // iPhone: say once where the lock is, since the app can't hold the screen there.
  useEffect(() => {
    if (!active || !cannotLockScreen()) return;
    try {
      if (localStorage.getItem(IOS_TIP_KEY)) return;
      localStorage.setItem(IOS_TIP_KEY, '1');
    } catch {
      return;
    }
    toast(tr("Turn on Rotation Lock in Control Centre so leaning doesn't turn the screen."), { duration: 8000 });
  }, [active]);

  const release = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    slowSince.current = null;
    if (locked.current) {
      locked.current = false;
      unlockScreen();
    }
  };

  useEffect(() => {
    if (!active || paused) {
      release();
      return;
    }
    if (speedMph >= LOCK_MPH) {
      slowSince.current = null;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (!locked.current) {
        locked.current = true;
        void lockScreen().then((held) => {
          if (!held) locked.current = false;
        });
      }
    } else if (locked.current && speedMph < UNLOCK_MPH && slowSince.current === null) {
      slowSince.current = Date.now();
      timer.current = window.setTimeout(release, UNLOCK_AFTER_MS);
    } else if (speedMph >= UNLOCK_MPH && slowSince.current !== null) {
      // Picked up again before the five seconds were out: stay held.
      slowSince.current = null;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, speedMph]);

  // Leaving the ride screen lets the screen go.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => release, []);
}
