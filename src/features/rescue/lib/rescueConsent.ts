import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

/** The rescue / crash detection disclaimer, word for word wherever it's shown. */
export const rescueDisclaimer = () =>
  tr("Blacktop is not an emergency monitoring service and does not contact emergency services (999/911/112). Crash detection and rescue alerts rely on device sensors and active mobile data, and cannot guarantee delivery.");

/**
 * Consent before auto-rescue (crash detection) turns on: every path that
 * switches it on (Settings, the Home safety card, the setup deck and the
 * "Your Blacktop" list) awaits requestAutoRescueConsent(), which shows
 * AutoRescueConsentDialog (mounted once in App.tsx) and resolves true only
 * once the rider has ticked that they understand and confirmed.
 */
let pending: ((ok: boolean) => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function requestAutoRescueConsent(): Promise<boolean> {
  // One dialog at a time: a second request answers the first as declined.
  pending?.(false);
  return new Promise((resolve) => {
    pending = (ok) => {
      pending = null;
      emit();
      resolve(ok);
    };
    emit();
  });
}

/** The dialog's side: whether it's open, and how it answers. */
export function useRescueConsentRequest(): { open: boolean; answer: (ok: boolean) => void } {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending !== null,
    () => false,
  );
  return { open, answer: (ok) => pending?.(ok) };
}
