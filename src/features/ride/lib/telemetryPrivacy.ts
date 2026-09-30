import { useSettings } from '@/features/settings';

/**
 * Public Road Privacy (Settings → Ride Metrics → "Log Peak Speed & Gs" off):
 * peaks (top speed, max lean, peak G) are still recorded with every ride, but
 * read "--" everywhere on screen, older rides included, and don't leave the
 * phone (shared cards, crew boards) while it's on. Turning it back off takes
 * the unlock pattern, and every figure is there again. Track Day receipts
 * always show theirs; current speed is never hidden.
 */

/** What a hidden peak reads as, everywhere. */
export const PEAK_HIDDEN = '--';

/** Whether peaks may be shown / shared right now (read straight from storage so module code can ask). */
export function keepPeakTelemetry(isTrackDay: boolean): boolean {
  if (isTrackDay) return true;
  try {
    return JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}')?.logPeakTelemetry !== false;
  } catch {
    return true;
  }
}

export function usePeaksHidden(): boolean {
  const { settings } = useSettings();
  return settings.logPeakTelemetry === false;
}
