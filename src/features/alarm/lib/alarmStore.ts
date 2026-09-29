import { useSyncExternalStore } from 'react';

/**
 * The anti-theft alarm's state (module store). Deliberately never saved:
 * closing the app is the one way out besides the pattern, and a fresh start is
 * always unarmed.
 *
 * setup   → no unlock pattern yet: draw one twice
 * arming  → exit delay: mount the phone and step away
 * armed   → watching lean and G
 * entry   → something moved it: a few seconds of beeps to unlock quietly
 * alarm   → the siren, until the pattern is drawn
 * rescue  → auto-rescue fired after a crash: the siren, so people nearby
 *           notice, until anyone taps Stop siren (no pattern)
 */
export type AlarmPhase = 'off' | 'setup' | 'arming' | 'armed' | 'entry' | 'alarm' | 'rescue';

export interface AlarmState {
  phase: AlarmPhase;
  /** When the current phase began (ms). */
  since: number;
  /** Last small movement warning (ms), for the "Movement detected" flash. */
  nudgeAt: number;
  cause: 'tilt' | 'impact' | 'attempts' | 'crash' | null;
}

let state: AlarmState = { phase: 'off', since: 0, nudgeAt: 0, cause: null };
const listeners = new Set<() => void>();

function set(patch: Partial<AlarmState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getAlarm = () => state;
export const isAlarmOn = () => state.phase !== 'off';

export function useAlarm(): AlarmState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function setAlarmPhase(phase: AlarmPhase, extra: Partial<AlarmState> = {}) {
  set({ phase, since: Date.now(), ...extra });
}

export function noteNudge() {
  set({ nudgeAt: Date.now() });
}

export function stopAlarm() {
  set({ phase: 'off', since: Date.now(), nudgeAt: 0, cause: null });
}
