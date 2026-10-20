/**
 * A rescue call asked for by hand, away from the ride screen (the map's held R,
 * Blacktop Console's held rescue action): one "Are you okay?" card for the whole
 * app, shown by RescueAskHost (mounted once in App.tsx, outside every sheet), so
 * a press inside a sheet or the map overlay can still be answered. The host sends
 * the convoy's call through the rescue bridge in a convoy, otherwise the solo
 * call from where the phone is. Imports nothing.
 */
import { useSyncExternalStore } from 'react';

let asking = false;
let sentAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Ask "Are you okay?"; nothing is sent unless the rider presses Send rescue. */
export function askRescue() {
  if (asking) return;
  asking = true;
  emit();
}

export function closeRescueAsk() {
  asking = false;
  emit();
}

/** A solo call went out (for 30 s callers show it as sent). */
export function markRescueSent() {
  sentAt = Date.now();
  emit();
  window.setTimeout(emit, 30_000);
}

export function useRescueAsk(): { asking: boolean; recentlySent: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => `${asking}|${Date.now() - sentAt < 30_000}`,
  );
  const [a, s] = snap.split('|');
  return { asking: a === 'true', recentlySent: s === 'true' };
}
