import { useEffect, useRef } from 'react';

interface Options {
  enabled: boolean;
  /** Current speed in mph (matches rideState.currentSpeed). */
  currentSpeed: number;
  /** Live total G-force magnitude, sourced from useGForce (shared sensor). */
  currentG: number;
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
 * Flags a "possible crash" when peak G force (from the shared useGForce sensor)
 * exceeds threshold AND speed stays near zero for `stopWindowSec` afterwards.
 *
 * Only arms after the rider has exceeded ARM_SPEED_MPH at least once.
 * Suppresses re-triggers for COOLDOWN_MS after each fire.
 */
export function useCrashDetection({
  enabled,
  currentSpeed,
  currentG,
  gThreshold,
  stopWindowSec,
  onPossibleCrash,
}: Options) {
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

  // Re-evaluate on every live G-force sample
  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastFireRef.current < COOLDOWN_MS) return;

    // Impact detected
    if (armedRef.current && currentG >= gThresholdRef.current && impactAtRef.current === null) {
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
  }, [enabled, currentG]);
}
