import { useCallback, useEffect, useRef } from 'react';

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
/** How often the post-impact "have they stopped?" check runs. */
const STOP_CHECK_MS = 500;

/**
 * Flags a "possible crash" when peak G force (from the shared useGForce sensor)
 * exceeds threshold AND speed stays near zero for `stopWindowSec` afterwards.
 *
 * Only arms after the rider has exceeded ARM_SPEED_MPH at least once.
 * Suppresses re-triggers for COOLDOWN_MS after each fire.
 *
 * Returns `onSample`: pass it to useGForce so each G-force peak is checked
 * outside React (no re-render per sample). The stop window runs on its own
 * timer, so it doesn't depend on how often the screen re-renders.
 */
export function useCrashDetection({
  enabled,
  currentSpeed,
  gThreshold,
  stopWindowSec,
  onPossibleCrash,
}: Options): (g: number) => void {
  const armedRef = useRef(false);
  const impactAtRef = useRef<number | null>(null);
  const lastFireRef = useRef<number>(0);
  const enabledRef = useRef(enabled);
  const currentSpeedRef = useRef(currentSpeed);
  const onPossibleCrashRef = useRef(onPossibleCrash);
  const gThresholdRef = useRef(gThreshold);
  const stopWindowRef = useRef(stopWindowSec);

  enabledRef.current = enabled;
  currentSpeedRef.current = currentSpeed;
  onPossibleCrashRef.current = onPossibleCrash;
  gThresholdRef.current = gThreshold;
  stopWindowRef.current = stopWindowSec;

  // Arm once we've moved
  useEffect(() => {
    if (enabled && currentSpeed >= ARM_SPEED_MPH) armedRef.current = true;
  }, [enabled, currentSpeed]);

  // Post-impact stop check
  const checkStopped = useCallback((now: number) => {
    if (impactAtRef.current === null) return;
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
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (Date.now() - lastFireRef.current >= COOLDOWN_MS) checkStopped(Date.now());
    }, STOP_CHECK_MS);
    return () => clearInterval(timer);
  }, [enabled, checkStopped]);

  // Each live G-force peak
  return useCallback((g: number) => {
    if (!enabledRef.current) return;
    const now = Date.now();
    if (now - lastFireRef.current < COOLDOWN_MS) return;

    // Impact detected
    if (armedRef.current && g >= gThresholdRef.current && impactAtRef.current === null) {
      impactAtRef.current = now;
    }
    checkStopped(now);
  }, [checkStopped]);
}
