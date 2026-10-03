import { noteMotionGranted } from '@/lib/motionPermission';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GVectorTracker, emptyGVector, type GMax } from '@/lib/gForceVector';

interface GForceState {
  currentG: number; // total acceleration magnitude in g, including gravity (~1.0 at rest)
  maxG: number;
  /** Friction-circle values (see lib/gForceVector): cornering (+ right) and braking (+) in g, gravity removed. */
  lateralG: number;
  longitudinalG: number;
  /** Peak G per direction (lib/gForceVector ENVELOPE_BINS). */
  envelope: number[];
  gMax: GMax;
  isSupported: boolean;
  permissionGranted: boolean;
}

interface GForceOptions {
  /** Restore this ride's peaks when its screen mounts again. Never shared between consumers. */
  initialVector?: { envelope: number[]; max: GMax };
  initialMaxG?: number;
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
  /**
   * Current lean in degrees (+ right) for vehicles that lean, read on every
   * sample: cornering G then comes from tan(lean), since a leaning bike's
   * phone barely feels sideways force. Leave null for cars.
   */
  leanRef?: { current: number | null };
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
  const [state, setState] = useState<GForceState>(() => {
    const v = emptyGVector();
    return { currentG: 0, maxG: options.initialMaxG ?? 0, lateralG: 0, longitudinalG: 0, envelope: options.initialVector?.envelope.slice() ?? v.envelope, gMax: { ...(options.initialVector?.max ?? v.max) }, isSupported: false, permissionGranted: false };
  });
  const trackerRef = useRef<GVectorTracker | null>(null);
  if (!trackerRef.current) {
    const tracker = new GVectorTracker();
    if (options.initialVector) {
      tracker.state.envelope = options.initialVector.envelope.slice();
      tracker.state.max = { ...options.initialVector.max };
    }
    trackerRef.current = tracker;
  }
  const leanRef = useRef(options.leanRef);
  leanRef.current = options.leanRef;

  const maxGRef = useRef(options.initialMaxG ?? 0);

  const requestPermission = useCallback(async () => {
    const anyMotion = (window as any).DeviceMotionEvent;
    if (anyMotion && typeof anyMotion.requestPermission === 'function') {
      try {
        const res = await anyMotion.requestPermission();
        if (res === 'granted') {
          noteMotionGranted();
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
    trackerRef.current?.reset();
    const v = emptyGVector();
    setState(prev => ({ ...prev, maxG: 0, lateralG: 0, longitudinalG: 0, envelope: v.envelope, gMax: v.max }));
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

      // Friction-circle vector (cheap; runs every sample so peaks aren't missed).
      if (e.accelerationIncludingGravity) {
        const lin = e.acceleration;
        const linear: [number, number, number] | null = lin && lin.x != null && lin.y != null && lin.z != null ? [lin.x, lin.y, lin.z] : null;
        const angle = window.screen?.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0);
        trackerRef.current?.update(
          [x, y, z],
          linear,
          angle,
          leanRef.current?.current ?? null,
          e.timeStamp || performance.now(),
        );
      }

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
      const v = trackerRef.current.state;
      setState(prev => ({
        ...prev,
        currentG,
        maxG: maxGRef.current,
        lateralG: v.lateral,
        longitudinalG: v.longitudinal,
        envelope: v.envelope.slice(),
        gMax: { ...v.max },
        permissionGranted: true,
      }));
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [isActive]);

  return { ...state, requestPermission, resetMax };
}
