import type { CrashEvent } from './crashDetector';

/**
 * What the crash check has made of the last hard knocks, kept on the phone
 * only (swept by Burn with every other `blacktop_` key) and shown on
 * /device-check: the one way to see, after a real ride, what it noticed and
 * why it did or didn't ask. Only knocks over the rider's threshold are noted,
 * so a ride writes a handful of lines at most.
 */
const KEY = 'blacktop_crash_trace';
const KEEP = 40;

export function noteCrashEvent(e: CrashEvent) {
  try {
    const list = readCrashTrace();
    list.push({ ...e, g: Math.round(e.g * 10) / 10, mph: Math.round(e.mph) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    // Storage full or blocked: the check itself doesn't depend on this.
  }
}

export function readCrashTrace(): CrashEvent[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearCrashTrace() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
