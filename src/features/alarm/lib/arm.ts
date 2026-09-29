import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { getActiveRideStatus, setActiveRidePaused } from '@/features/ride';
import { holdAudio } from '@/lib/radioFx';
import { isAlarmOn, setAlarmPhase, stopAlarm } from './alarmStore';
import { hasAlarmPattern } from './pattern';
import { requestTamperPermission } from '../hooks/useTamperSensors';

/** Above this, the vehicle isn't parked: no arming mid-ride. */
const MAX_ARM_MPH = 4;

let releaseAudio: (() => void) | null = null;

/**
 * Lock the screen and arm the alarm (from a tap: iOS only grants motion
 * access and starts audio from one). A running ride is paused; unlocking
 * never resumes it, the rider does that with the play button.
 */
export async function armAlarm(): Promise<void> {
  if (isAlarmOn()) return;
  const ride = getActiveRideStatus();
  if (ride.isActive && !ride.isPaused && ride.currentSpeed > MAX_ARM_MPH) {
    toast(tr("Stop before arming the alarm"));
    return;
  }
  // Wake the audio from this tap so the siren can start later untouched.
  releaseAudio?.();
  releaseAudio = holdAudio();
  if (!(await requestTamperPermission())) {
    releaseAudio?.();
    releaseAudio = null;
    toast.error(tr("Allow motion access to arm the alarm"));
    return;
  }
  if (ride.isActive && !ride.isPaused) setActiveRidePaused(true);
  setAlarmPhase(hasAlarmPattern() ? 'arming' : 'setup', { cause: null, nudgeAt: 0 });
}

/** Turn it all off (the right pattern, or Cancel before it's armed). The ride stays paused. */
export function disarmAlarm() {
  stopAlarm();
  releaseAudio?.();
  releaseAudio = null;
}
