import { useState, useEffect, useRef, useCallback } from 'react';

interface LeanAngleState {
  currentLean: number; // Degrees, positive = right, negative = left
  maxLeanLeft: number; // Max lean to the left (positive value)
  maxLeanRight: number; // Max lean to the right (positive value)
  isSupported: boolean;
  permissionGranted: boolean;
}

// Lower = smoother, higher = more responsive
const SMOOTHING_FACTOR = 0.2;
const MAX_LEAN = 90;

function getScreenAngle(): number {
  const screenAngle = (globalThis as any)?.screen?.orientation?.angle;
  if (typeof screenAngle === 'number') return screenAngle;
  const legacy = (globalThis as any)?.orientation;
  if (typeof legacy === 'number') return legacy;
  return 0;
}

function rotateXYForScreen(x: number, y: number, angleDeg: number) {
  const a = ((angleDeg % 360) + 360) % 360;
  switch (a) {
    case 90:
      return { x: y, y: -x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: -y, y: x };
    case 0:
    default:
      return { x, y };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function useLeanAngle(isActive: boolean = false) {
  const [state, setState] = useState<LeanAngleState>({
    currentLean: 0,
    maxLeanLeft: 0,
    maxLeanRight: 0,
    isSupported: false,
    permissionGranted: false,
  });

  const smoothedLean = useRef(0);
  const maxLeanLeftRef = useRef(0);
  const maxLeanRightRef = useRef(0);

  // Request permission for iOS 13+ (orientation + motion)
  const requestPermission = useCallback(async () => {
    const hasOrientation = typeof DeviceOrientationEvent !== 'undefined';
    const hasMotion = typeof DeviceMotionEvent !== 'undefined';

    if (!hasOrientation && !hasMotion) {
      console.log('[LeanAngle] Device sensors not supported');
      return false;
    }

    let granted = false;

    // iOS 13+ requires explicit permission
    const requestOrientation = async () => {
      if (hasOrientation && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          return permission === 'granted';
        } catch (err) {
          console.error('[LeanAngle] Orientation permission request failed:', err);
        }
      }
      return false;
    };

    const requestMotion = async () => {
      if (hasMotion && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceMotionEvent as any).requestPermission();
          return permission === 'granted';
        } catch (err) {
          console.error('[LeanAngle] Motion permission request failed:', err);
        }
      }
      return false;
    };

    // Try to request both (either being granted is enough for our purposes)
    const [o, m] = await Promise.all([requestOrientation(), requestMotion()]);
    granted = o || m;

    // Android and older iOS don't need permission
    if (!granted && (!hasOrientation || typeof (DeviceOrientationEvent as any).requestPermission !== 'function') && (!hasMotion || typeof (DeviceMotionEvent as any).requestPermission !== 'function')) {
      granted = true;
    }

    setState(prev => ({ ...prev, permissionGranted: granted, isSupported: true }));
    return granted;
  }, []);

  // Reset max values (call when starting a new ride)
  const resetMax = useCallback(() => {
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    smoothedLean.current = 0;
    setState(prev => ({
      ...prev,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
    }));
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const hasMotion = typeof DeviceMotionEvent !== 'undefined';
    const hasOrientation = typeof DeviceOrientationEvent !== 'undefined';

    if (!hasMotion && !hasOrientation) {
      console.log('[LeanAngle] Not supported on this device');
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    // Preferred: gravity vector (much more accurate and less "sensitive" than gamma)
    const handleMotion = (event: DeviceMotionEvent) => {
      const g = event.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;

      const angle = getScreenAngle();
      const rotated = rotateXYForScreen(g.x, g.y, angle);

      // If device is facing the rider (screen vertical), this gives a stable roll angle.
      // 0 = upright, + = right lean, - = left lean
      let leanAngle = (Math.atan2(rotated.x, -rotated.y) * 180) / Math.PI;
      leanAngle = clamp(leanAngle, -MAX_LEAN, MAX_LEAN);

      smoothedLean.current = smoothedLean.current + SMOOTHING_FACTOR * (leanAngle - smoothedLean.current);
      const currentLean = Math.round(smoothedLean.current);

      if (currentLean < 0) {
        const left = Math.abs(currentLean);
        if (left > maxLeanLeftRef.current) maxLeanLeftRef.current = left;
      } else if (currentLean > 0) {
        if (currentLean > maxLeanRightRef.current) maxLeanRightRef.current = currentLean;
      }

      setState(prev => ({
        ...prev,
        currentLean,
        maxLeanLeft: maxLeanLeftRef.current,
        maxLeanRight: maxLeanRightRef.current,
        permissionGranted: true,
      }));
    };

    // Fallback: orientation angles
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event;
      if (beta == null || gamma == null) return;

      // Basic correction when device is roughly upright
      const absBeta = Math.abs(beta);
      let leanAngle = gamma;
      if (absBeta > 45 && absBeta < 135) {
        const pitchFromUpright = Math.abs(beta - 90) * (Math.PI / 180);
        leanAngle = gamma * Math.cos(pitchFromUpright);
        if (beta > 90) leanAngle = -leanAngle;
      }

      leanAngle = clamp(leanAngle, -MAX_LEAN, MAX_LEAN);

      smoothedLean.current = smoothedLean.current + SMOOTHING_FACTOR * (leanAngle - smoothedLean.current);
      const currentLean = Math.round(smoothedLean.current);

      if (currentLean < 0) {
        const left = Math.abs(currentLean);
        if (left > maxLeanLeftRef.current) maxLeanLeftRef.current = left;
      } else if (currentLean > 0) {
        if (currentLean > maxLeanRightRef.current) maxLeanRightRef.current = currentLean;
      }

      setState(prev => ({
        ...prev,
        currentLean,
        maxLeanLeft: maxLeanLeftRef.current,
        maxLeanRight: maxLeanRightRef.current,
        permissionGranted: true,
      }));
    };

    if (hasMotion) {
      window.addEventListener('devicemotion', handleMotion, true);
    } else {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      if (hasMotion) {
        window.removeEventListener('devicemotion', handleMotion, true);
      } else {
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, [isActive]);

  const maxLean = Math.max(state.maxLeanLeft, state.maxLeanRight);

  return {
    ...state,
    maxLean,
    requestPermission,
    resetMax,
  };
}
