import { useEffect, useRef, useState, useCallback } from 'react';

interface Options {
  enabled: boolean;
  /** Current speed in mph (matches rideState.currentSpeed). */
  currentSpeed: number;
  /** G-force impact threshold (multiples of 1g, e.g. 5 means 5g). */
  gThreshold: number;
  /** Seconds of near-zero speed required after impact to trigger. */
  stopWindowSec: number;
  /** Called once when a possible crash is detected. */
  onPossibleCrash: () => void;
}

const NEAR_ZERO_MPH = 3;
const ARM_SPEED_MPH = 15;
const COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Listens to devicemotion and flags a "possible crash" when peak G force
 * exceeds threshold AND speed stays near zero for `stopWindowSec` afterwards.
 *
 * Only arms after the rider has exceeded ARM_SPEED_MPH at least once.
 * Suppresses re-triggers for COOLDOWN_MS after each fire.
 */
export function useCrashDetection({
  enabled,
  currentSpeed,
  gThreshold,
  stopWindowSec,
  onPossibleCrash,
}: Options) {
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const armedRef = useRef(false);
  const impactAtRef = useRef<number | null>(null);
  const lastFireRef = useRef<number>(0);
  const currentSpeedRef = useRef(currentSpeed);
  const onPossibleCrashRef = useRef(onPossibleCrash);
  const gThresholdRef = useRef(gThreshold);
  const stopWindowRef = useRef(stopWindowSec);

  currentSpeedRef.current = currentSpeed;
  onPossibleCrashRef.current = onPossibleCrash;
  gThresholdRef.current = gThreshold;
  stopWindowRef.current = stopWindowSec;

  // Arm once we've moved
  useEffect(() => {
    if (enabled && currentSpeed >= ARM_SPEED_MPH) armedRef.current = true;
  }, [enabled, currentSpeed]);

  const requestPermission = useCallback(async () => {
    // iOS 13+ requires explicit permission for DeviceMotion
    const anyMotion = (window as any).DeviceMotionEvent;
    if (anyMotion && typeof anyMotion.requestPermission === 'function') {
      try {
        const res = await anyMotion.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const attach = async () => {
      const anyMotion = (window as any).DeviceMotionEvent;
      if (anyMotion && typeof anyMotion.requestPermission === 'function') {
        // Don't auto-prompt here; the UI surfaces a one-time prompt.
        // If user hasn't granted yet, listener won't fire — flag it.
        setPermissionNeeded(true);
      }
      if (cancelled) return;

      const handler = (e: DeviceMotionEvent) => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        if (!a) return;
        const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
        const g = Math.sqrt(x * x + y * y + z * z) / 9.81;

        const now = Date.now();
        if (now - lastFireRef.current < COOLDOWN_MS) return;

        // Impact detected
        if (armedRef.current && g >= gThresholdRef.current && impactAtRef.current === null) {
          impactAtRef.current = now;
        }

        // Post-impact stop check
        if (impactAtRef.current !== null) {
          const elapsed = (now - impactAtRef.current) / 1000;
          if (currentSpeedRef.current > NEAR_ZERO_MPH) {
            // Rider kept moving — false alarm, reset
            impactAtRef.current = null;
          } else if (elapsed >= stopWindowRef.current) {
            // Possible crash: high-G then stopped
            lastFireRef.current = now;
            impactAtRef.current = null;
            onPossibleCrashRef.current();
          }
        }
      };

      window.addEventListener('devicemotion', handler);
      return () => window.removeEventListener('devicemotion', handler);
    };

    let detach: (() => void) | undefined;
    attach().then((d) => { detach = d; });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [enabled]);

  return { permissionNeeded, requestPermission };
}
