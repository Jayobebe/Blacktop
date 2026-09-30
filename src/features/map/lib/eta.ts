/**
 * ETA ranges. With Blacktop's own geo server, a route comes back with the
 * times both routing engines give it (`durationRangeSeconds`), and every ETA
 * and time-left is shown as a window ("12:44–13:05"): two engines disagree,
 * and a window is more trusted than one precise, wrong time. Without it (the
 * public servers) there's no range and everything shows one time, as before.
 */

/** How the soonest / latest times compare with the route's own time (e.g. [0.92, 1.1]), or null for a single time. */
export type EtaSpread = readonly [number, number] | null;

export function etaSpread(route: { durationSeconds: number; durationRangeSeconds?: [number, number] } | null | undefined): EtaSpread {
  const r = route?.durationRangeSeconds;
  if (!r || !(route.durationSeconds > 0) || !(r[0] > 0) || !(r[1] >= r[0])) return null;
  return [r[0] / route.durationSeconds, r[1] / route.durationSeconds];
}

/** Two ends of a range, or one value when they read the same. */
function range(a: string, b: string) {
  return a === b ? a : `${a}–${b}`;
}

/** Clock time `seconds` from now: "12:44", or "12:44–13:05" with a spread. */
export function etaClock(seconds: number, spread: EtaSpread): string {
  const clock = (s: number) => new Date(Date.now() + s * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return spread ? range(clock(seconds * spread[0]), clock(seconds * spread[1])) : clock(seconds);
}

/** A duration in the caller's format, as a range with a spread. */
export function spreadDuration(seconds: number, spread: EtaSpread, format: (s: number) => string): string {
  return spread ? range(format(seconds * spread[0]), format(seconds * spread[1])) : format(seconds);
}
