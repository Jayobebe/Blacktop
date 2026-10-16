import { useEffect, useRef } from 'react';
import { useSettings } from '@/features/settings';
import { speak } from '@/features/map/lib/speech';
import { spokenDistance } from '@/features/map/lib/navigation';
import { tr } from '@/lib/i18n';
import type { ActiveRideState } from '@/types/blacktop';

const M_PER_MI = 1609.344;

/** "1 hour 20 minutes in." Whole sentences, for every language. */
function spokenTime(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return m === 1 ? tr("1 minute in.") : tr("{0} minutes in.", [m]);
  if (m === 0) return h === 1 ? tr("1 hour in.") : tr("{0} hours in.", [h]);
  return h === 1 ? tr("1 hour {0} minutes in.", [m]) : tr("{0} hours {1} minutes in.", [h, m]);
}

/** A speed kept in mph, as it's read out. */
function spokenSpeed(mph: number, kph: boolean): string {
  return kph ? tr("{0} kilometres per hour", [Math.round(mph * 1.609344)]) : tr("{0} miles per hour", [Math.round(mph)]);
}

/**
 * Spoken ride updates (opt-in, Settings → Ride Metrics, `rideUpdatesEnabled`):
 * every `rideUpdatesEvery` minutes of riding (10, 20, 30 or 60) the radio
 * voice (the pilot voice when downloaded) reads out how long, how far, and the
 * average speed for riders who care about speed: "30 minutes in. 14 miles
 * done. Averaging 28 miles per hour." Ride time doesn't count while paused;
 * a ride restored mid-way starts counting from where it is.
 */
export function useRideUpdates(ride: Pick<ActiveRideState, 'isActive' | 'isPaused' | 'distance' | 'duration'>) {
  const { settings } = useSettings();
  const on = settings.rideUpdatesEnabled && ride.isActive;
  const every = Math.max(1, settings.rideUpdatesEvery || 30) * 60;
  const lastStep = useRef<number | null>(null);

  useEffect(() => {
    if (!on) {
      lastStep.current = null;
      return;
    }
    const step = Math.floor(ride.duration / every);
    if (lastStep.current === null) {
      lastStep.current = step;
      return;
    }
    if (step <= lastStep.current || ride.isPaused) return;
    lastStep.current = step;
    const parts = [spokenTime(step * every)];
    if (ride.distance > 0.1) parts.push(tr("{0} done.", [spokenDistance(ride.distance * M_PER_MI, settings.distanceUnit)]));
    if (settings.speedFocusEnabled && ride.duration > 60 && ride.distance > 0.1) {
      parts.push(tr("Averaging {0}.", [spokenSpeed(ride.distance / (ride.duration / 3600), settings.speedUnit === 'kph')]));
    }
    speak(parts.join(' '));
    // Only a new step speaks; the rest is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ride.duration, every]);
}
