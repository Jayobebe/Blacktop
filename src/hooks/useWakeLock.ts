import { useState, useCallback, useEffect, useRef } from 'react';

interface WakeLockState {
  isSupported: boolean;
  isActive: boolean;
}

/** How often to check the lock is still held while it's wanted. */
const REFRESH_MS = 15_000;

/**
 * Keeps the screen on while a screen wants it (a ride, the lobby, the map).
 *
 * The browser drops a wake lock whenever the page is hidden (screen off, app
 * switch, a system sheet on some Androids, battery saver), and a dropped lock
 * never comes back on its own. So once `request()` is called, the lock is
 * re-taken whenever the page is visible again, regains focus, and on a short
 * refresh timer, until `release()` or unmount.
 */
export function useWakeLock() {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isActive, setIsActive] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wantedRef = useRef(false);
  const acquiringRef = useRef(false);

  const acquire = useCallback(async () => {
    if (!isSupported || !wantedRef.current) return false;
    if (wakeLockRef.current && !wakeLockRef.current.released) return true;
    // Only a visible page can hold a lock; the visibility listener retries.
    if (document.visibilityState !== 'visible' || acquiringRef.current) return false;

    acquiringRef.current = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // Released (or unmounted) while the request was in flight.
      if (!wantedRef.current) {
        sentinel.release().catch(() => {});
        return false;
      }
      wakeLockRef.current = sentinel;
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        setIsActive(false);
      });
      setIsActive(true);
      return true;
    } catch (err) {
      // NotAllowedError while not focused / on battery saver: the refresh retries.
      console.warn('[WakeLock] Could not acquire:', (err as Error)?.name ?? err);
      setIsActive(false);
      return false;
    } finally {
      acquiringRef.current = false;
    }
  }, [isSupported]);

  const request = useCallback(async () => {
    if (!isSupported) return false;
    wantedRef.current = true;
    return acquire();
  }, [isSupported, acquire]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // Already gone.
      }
    }
    setIsActive(false);
  }, []);

  // Re-take the lock whenever it may have been dropped.
  useEffect(() => {
    if (!isSupported) return;
    const refresh = () => {
      if (wantedRef.current) void acquire();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('fullscreenchange', refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('fullscreenchange', refresh);
      window.clearInterval(timer);
    };
  }, [isSupported, acquire]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantedRef.current = false;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  return {
    isSupported,
    isActive,
    request,
    release,
  };
}
