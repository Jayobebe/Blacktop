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
/** An impact only counts if the vehicle was doing at least this within the last few seconds. */
const MOVING_MPH = 8;
const MOVING_RECENT_MS = 5000;
/** How long after an impact the vehicle has to come to rest. Still moving after that: it rode on. */
const SETTLE_MS = 12000;
const COOLDOWN_MS = 2 * 60 * 1000;
/** How often the post-impact "have they stopped?" check runs. */
const STOP_CHECK_MS = 500;

/**
 * Flags a "possible crash": a hard impact while the vehicle was moving, after
 * which it comes to rest within `SETTLE_MS` and stays at rest for
 * `stopWindowSec`.
 *
 * It used to drop an impact the instant speed read above walking pace, and
 * the speed is always still high in the moment of a crash, so a real one was
 * thrown away every time; all it ever caught was a phone knocked at a
 * standstill. Now an impact at a standstill is ignored (the phone being
 * handled, the bike going on its stand), and one at speed is held while the
 * vehicle slows.
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
  /** Since when the vehicle has been at rest after the impact. */
  const restSinceRef = useRef<number | null>(null);
  /** When the vehicle was last really moving. */
  const movingAtRef = useRef(0);
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
  if (enabled && currentSpeed >= MOVING_MPH) movingAtRef.current = Date.now();

  // Arm once we've moved
  useEffect(() => {
    if (enabled && currentSpeed >= ARM_SPEED_MPH) armedRef.current = true;
  }, [enabled, currentSpeed]);

  // After an impact: has the vehicle come to rest, and stayed there?
  const checkStopped = useCallback((now: number) => {
    if (impactAtRef.current === null) return;
    if (currentSpeedRef.current > NEAR_ZERO_MPH) {
      restSinceRef.current = null;
      // Still going well after the impact: a pothole, not a crash.
      if (now - impactAtRef.current > SETTLE_MS) impactAtRef.current = null;
      return;
    }
    if (restSinceRef.current === null) restSinceRef.current = now;
    if (now - restSinceRef.current >= stopWindowRef.current * 1000) {
      lastFireRef.current = now;
      impactAtRef.current = null;
      restSinceRef.current = null;
      onPossibleCrashRef.current();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      impactAtRef.current = null;
      restSinceRef.current = null;
      return;
    }
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
    if (currentSpeedRef.current >= MOVING_MPH) movingAtRef.current = now;

    // A hard hit, while (or just after) really moving.
    if (armedRef.current && g >= gThresholdRef.current && impactAtRef.current === null && now - movingAtRef.current <= MOVING_RECENT_MS) {
      impactAtRef.current = now;
      restSinceRef.current = null;
    }
  }, []);
}
