import { useEffect, useRef } from 'react';

import { requestMotionAccess } from '@/lib/motionPermission';

/** Motion and orientation access (iOS asks only from a tap; remembered for the next launch). */
export const requestTamperPermission = requestMotionAccess;

/**
 * The alarm's own sensor wrapper: tilt (orientation beta / gamma, any way up,
 * unlike ride lean which ignores a phone lying flat) about 20 times a second,
 * and the peak G of each ~50 ms window (~1 at rest). Only while `active`.
 */
export function useTamperSensors(active: boolean, onTilt: (beta: number, gamma: number) => void, onJolt: (g: number) => void) {
  const tiltRef = useRef(onTilt);
  tiltRef.current = onTilt;
  const joltRef = useRef(onJolt);
  joltRef.current = onJolt;

  useEffect(() => {
    if (!active) return;
    let lastTilt = 0;
    let lastJolt = 0;
    let peak = 1;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const now = performance.now();
      if (now - lastTilt < 50) return;
      lastTilt = now;
      tiltRef.current(e.beta, e.gamma);
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const g = Math.hypot(a.x, a.y, a.z) / 9.81;
      if (Math.abs(g - 1) > Math.abs(peak - 1)) peak = g;
      const now = performance.now();
      if (now - lastJolt < 50) return;
      lastJolt = now;
      joltRef.current(peak);
      peak = 1;
    };
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, [active]);
}
