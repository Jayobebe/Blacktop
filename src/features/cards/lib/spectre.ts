/**
 * Spectre (dog tag) times: a lap time with thousandths ("1:23.456"), or a
 * whole-second time ("3:41") for Spectres earned before Track Day records.
 */
export function formatSpectreTime(sec: number): string {
  const v = Math.max(0, sec);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return Number.isInteger(v) ? `${m}:${String(s).padStart(2, '0')}` : `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** Signed gap to the time that was beaten, e.g. "-0.412" (faster). */
export function formatSpectreGap(timeSec: number, targetSec: number): string {
  const diff = timeSec - targetSec;
  const sign = diff < 0 ? '-' : '+';
  const a = Math.abs(diff);
  return Number.isInteger(timeSec) && Number.isInteger(targetSec) ? `${sign}${formatSpectreTime(a)}` : `${sign}${a.toFixed(3)}`;
}
