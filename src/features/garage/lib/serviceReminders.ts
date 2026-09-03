import type { MaintItem } from '../types';

/**
 * Service reminders combine a mileage interval with an optional time interval
 * (whichever comes first), so things like brake fluid or an annual service
 * still nag even if the bike barely moves.
 */

export type ServiceTone = 'ok' | 'warn' | 'over';

export interface ServiceStatus {
  /** Distance remaining until due, km (negative = overdue). */
  dueInKm: number;
  /** Days remaining until due, or null when no time interval is set. */
  dueInDays: number | null;
  /** Progress through the interval, 0 – 100 (worst of the two clocks). */
  pct: number;
  tone: ServiceTone;
  /** Which clock is driving the status. */
  reason: 'distance' | 'time';
}

const DAY = 86400000;
/** Warn this far ahead. */
const WARN_KM = 200;
const WARN_DAYS = 14;

export function serviceStatus(item: MaintItem, odoKm: number, now = Date.now()): ServiceStatus {
  const dueAtKm = item.lastServiceKm + item.intervalKm;
  const dueInKm = dueAtKm - odoKm;
  const kmPct = Math.max(0, Math.min(100, ((item.intervalKm - dueInKm) / item.intervalKm) * 100));

  let dueInDays: number | null = null;
  let timePct = 0;
  if (item.intervalMonths && item.intervalMonths > 0) {
    const last = item.lastServiceAt ?? now;
    const totalDays = item.intervalMonths * 30.44;
    const elapsedDays = (now - last) / DAY;
    dueInDays = Math.ceil(totalDays - elapsedDays);
    timePct = Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));
  }

  const reason: 'distance' | 'time' = timePct > kmPct ? 'time' : 'distance';
  const pct = Math.max(kmPct, timePct);

  let tone: ServiceTone = 'ok';
  if (dueInKm <= 0 || (dueInDays !== null && dueInDays <= 0)) tone = 'over';
  else if (dueInKm <= WARN_KM || (dueInDays !== null && dueInDays <= WARN_DAYS)) tone = 'warn';

  return { dueInKm, dueInDays, pct, tone, reason };
}

/** Items that need attention now (overdue first). */
export function dueItems(items: MaintItem[], odoKm: number, now = Date.now()) {
  return items
    .map((item) => ({ item, status: serviceStatus(item, odoKm, now) }))
    .filter((e) => e.status.tone !== 'ok')
    .sort((a, b) => (a.status.tone === b.status.tone ? b.status.pct - a.status.pct : a.status.tone === 'over' ? -1 : 1));
}
