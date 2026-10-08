import { useCallback, useEffect, useRef } from 'react';
import { CrashDetector } from '../lib/crashDetector';
import { noteCrashEvent } from '../lib/crashTrace';

interface Options {
  enabled: boolean;
  /** Current speed in mph (matches rideState.currentSpeed). */
  currentSpeed: number;
  /**
   * Something that changes with every GPS fix (its timestamp). Speed only
   * changes when a fix arrives, so this is how the check knows the speed it
   * has is old once fixes stop. Leave out and the speed is always trusted.
   */
  fixStamp?: number | null;
  /** G-force impact threshold (multiples of 1g, e.g. 5 means 5g). */
  gThreshold: number;
  /** Seconds of near-zero speed required after impact to trigger. */
  stopWindowSec: number;
  /** Called once when a possible crash is detected. */
  onPossibleCrash: () => void;
}

/** How often the post-impact "have they stopped?" check runs. */
const STOP_CHECK_MS = 500;

/**
 * Flags a "possible crash": a hard impact while the vehicle was moving, after
 * which it comes to rest and stays there. The reasoning is `CrashDetector`
 * (`lib/crashDetector.ts`, tested by `npm run crash:check`); this hook feeds it
 * the ride's speed and the G-force samples and keeps its clock.
 *
 * It used to drop an impact the instant speed read above walking pace, and
 * the speed is always still high in the moment of a crash, so a real one was
 * thrown away every time; all it ever caught was a phone knocked at a
 * standstill.
 *
 * Only arms after the rider has exceeded `CRASH.armMph` at least once, and
 * suppresses re-triggers for `CRASH.cooldownMs` after each fire.
 *
 * Returns `onSample`: pass it to useGForce so each G-force peak is checked
 * outside React (no re-render per sample). The stop window runs on its own
 * timer, so it doesn't depend on how often the screen re-renders.
 */
export function useCrashDetection({ enabled, currentSpeed, fixStamp, gThreshold, stopWindowSec, onPossibleCrash }: Options): (g: number) => void {
  const detectorRef = useRef<CrashDetector | null>(null);
  if (!detectorRef.current) detectorRef.current = new CrashDetector(gThreshold, stopWindowSec, noteCrashEvent);
  const detector = detectorRef.current;
  detector.gThreshold = gThreshold;
  detector.stopWindowSec = stopWindowSec;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onPossibleCrashRef = useRef(onPossibleCrash);
  onPossibleCrashRef.current = onPossibleCrash;

  // When the fix behind the speed arrived, by this phone's clock (a fix's own timestamp can run on another).
  const stampRef = useRef(fixStamp);
  const fixAtRef = useRef<number | null>(null);
  if (fixStamp !== stampRef.current) {
    stampRef.current = fixStamp;
    fixAtRef.current = fixStamp == null ? null : Date.now();
  }
  if (enabled) detector.speed(currentSpeed, Date.now(), fixAtRef.current);

  useEffect(() => {
    if (!enabled) {
      detector.clear();
      return;
    }
    const timer = setInterval(() => {
      if (detector.tick(Date.now())) onPossibleCrashRef.current();
    }, STOP_CHECK_MS);
    return () => clearInterval(timer);
  }, [enabled, detector]);

  // Each live G-force peak
  return useCallback(
    (g: number) => {
      if (enabledRef.current) detector.sample(g, Date.now());
    },
    [detector],
  );
}
