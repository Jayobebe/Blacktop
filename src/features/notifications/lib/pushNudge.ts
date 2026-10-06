import { useSyncExternalStore } from 'react';

/**
 * Notifications are asked for at a moment that explains itself, once: the
 * first time a rider joins a crew or a convoy, or turns on crash detection.
 * Those places call `offerPushNudge`; `PushNudge` (mounted once in App)
 * decides whether there's anything to ask and shows the card. This file
 * imports nothing, so any feature can call it without pulling push in.
 */
export type PushNudgeReason = 'crew' | 'convoy' | 'rescue';

export const PUSH_NUDGE_KEY = 'blacktop_push_nudged';

let reason: PushNudgeReason | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const asked = () => {
  try {
    return !!localStorage.getItem(PUSH_NUDGE_KEY);
  } catch {
    return true;
  }
};

export function offerPushNudge(why: PushNudgeReason) {
  if (reason || asked()) return;
  reason = why;
  emit();
}

/** The card was answered, or there was nothing to ask: it doesn't come back. */
export function closePushNudge(remember = true) {
  if (remember) {
    try {
      localStorage.setItem(PUSH_NUDGE_KEY, '1');
    } catch {
      // Asked again another day, which is no harm.
    }
  }
  if (!reason) return;
  reason = null;
  emit();
}

export function usePushNudge(): PushNudgeReason | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => reason,
    () => reason,
  );
}
