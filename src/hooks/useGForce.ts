import { useState, useEffect, useRef, useCallback } from 'react';

interface GForceState {
  currentG: number; // total acceleration magnitude in g, including gravity (~1.0 at rest)
  maxG: number;
  isSupported: boolean;
  permissionGranted: boolean;
}

interface GForceOptions {
  /**
   * Keep `currentG` / `maxG` React state live (for a gauge on screen). Off when
   * nothing shows the value: then the sensor causes no re-renders at all, and
   * consumers like crash detection read it through `onSample`. Default on.
   */
  display?: boolean;
  /** Minimum ms between display updates. Default 50 (≈20Hz). */
  displayIntervalMs?: number;
  /** Peak of each ~50ms window, outside React (crash detection). */
  onSample?: (g: number) => void;
}

/**
 * Single source of truth for live G-force: one devicemotion listener shared by
 * the G-force gauge and crash detection (fed through `onSample` rather than
 * reading the sensor itself), so the value is computed in exactly one place.
 */
export function useGForce(isActive: boolean = false, options: GForceOptions = {}) {
  const { display = true, displayIntervalMs = 50 } = options;
  const displayRef = useRef(display);
  displayRef.current = display;
  const displayIntervalRef = useRef(displayIntervalMs);
  displayIntervalRef.current = displayIntervalMs;
  const onSampleRef = useRef(options.onSample);
  onSampleRef.current = options.onSample;
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

    // Every sample is read; crash detection gets the peak of each ~50ms window
    // (≈20Hz) so spikes are never lost, and the gauge (if shown) re-renders at
    // most every displayIntervalMs.
    let windowPeak = 0;
    let lastEmit = 0;
    let lastDisplay = 0;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
      const g = Math.sqrt(x * x + y * y + z * z) / 9.81;

      if (g > maxGRef.current) maxGRef.current = g;
      if (g > windowPeak) windowPeak = g;

      const now = performance.now();
      if (now - lastEmit < 50) return;
      lastEmit = now;
      const currentG = windowPeak;
      windowPeak = 0;
      onSampleRef.current?.(currentG);

      if (!displayRef.current || now - lastDisplay < displayIntervalRef.current) return;
      lastDisplay = now;
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
