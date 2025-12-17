import { useState, useCallback, useEffect, useRef } from 'react';

interface WakeLockState {
  isSupported: boolean;
  isActive: boolean;
}

export function useWakeLock() {
  const [state, setState] = useState<WakeLockState>({
    isSupported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    isActive: false,
  });
  
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!state.isSupported) {
      console.log('[WakeLock] Not supported on this device');
      return false;
    }

    try {
      // Release existing lock first
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
      }

      wakeLockRef.current = await navigator.wakeLock.request('screen');
      
      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released');
        setState(prev => ({ ...prev, isActive: false }));
      });

      console.log('[WakeLock] Screen wake lock acquired');
      setState(prev => ({ ...prev, isActive: true }));
      return true;
    } catch (err) {
      console.error('[WakeLock] Failed to acquire:', err);
      setState(prev => ({ ...prev, isActive: false }));
      return false;
    }
  }, [state.isSupported]);

  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[WakeLock] Manually released');
      } catch (err) {
        console.error('[WakeLock] Release error:', err);
      }
    }
    setState(prev => ({ ...prev, isActive: false }));
  }, []);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && state.isActive && !wakeLockRef.current) {
        console.log('[WakeLock] Page visible, re-acquiring lock');
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isActive, request]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  return {
    ...state,
    request,
    release,
  };
}
