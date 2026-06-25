import { useState, useEffect, useRef, useCallback } from 'react';

interface GForceState {
  currentG: number; // total acceleration magnitude in g, including gravity (~1.0 at rest)
  maxG: number;
  isSupported: boolean;
  permissionGranted: boolean;
}

/**
 * Single source of truth for live G-force: one devicemotion listener shared by
 * the G-force gauge and useCrashDetection (which consumes `currentG` instead of
 * reading the sensor itself), so the value is computed in exactly one place.
 */
export function useGForce(isActive: boolean = false) {
  const [state, setState] = useState<GForceState>({
    currentG: 0,
    maxG: 0,
    isSupported: false,
    permissionGranted: false,
  });

  const maxGRef = useRef(0);

  const requestPermission = useCallback(async () => {
    const anyMotion = (window as any).DeviceMotionEvent;
    if (anyMotion && typeof anyMotion.requestPermission === 'function') {
      try {
        const res = await anyMotion.requestPermission();
        if (res === 'granted') {
          setState(prev => ({ ...prev, permissionGranted: true, isSupported: true }));
          return true;
        }
        return false;
      } catch (err) {
        console.error('[GForce] Permission request failed:', err);
        return false;
      }
    }
    setState(prev => ({ ...prev, permissionGranted: true, isSupported: true }));
    return true;
  }, []);

  const resetMax = useCallback(() => {
    maxGRef.current = 0;
    setState(prev => ({ ...prev, maxG: 0 }));
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (typeof DeviceMotionEvent === 'undefined') return;

    setState(prev => ({ ...prev, isSupported: true }));

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
      const currentG = Math.sqrt(x * x + y * y + z * z) / 9.81;

      if (currentG > maxGRef.current) {
        maxGRef.current = currentG;
      }

      setState(prev => ({
        ...prev,
        currentG,
        maxG: maxGRef.current,
        permissionGranted: true,
      }));
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [isActive]);

  return { ...state, requestPermission, resetMax };
}
