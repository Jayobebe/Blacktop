import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

/**
 * Shares a short message (e.g. "Riding to …, ETA 14:05") through the phone's
 * share sheet, so the rider picks WhatsApp, Messages or anything else. Falls
 * back to copying it where there's no share sheet (most desktops).
 * Nothing goes through Blacktop's servers.
 */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const cancelled = (e: unknown) => /cancel|abort/i.test(String((e as Error)?.name ?? '') + String((e as Error)?.message ?? e));
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ text });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
