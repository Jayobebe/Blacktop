/**
 * Wrapped: a period of riding summed up (pages/Wrapped plays it as story
 * slides). A week (Monday to Sunday), a month, a year or all time, any of
 * them past or the one going on, worked out on the phone from the rides kept
 * there. Which finished periods have been opened is kept so Stats on Home's
 * nav bar can glow while one is new (`blacktop_wrapped_seen`, left out of
 * backups: it's only a "seen" mark).
 */
import { useSyncExternalStore } from 'react';
import type { RideSession } from '@/types/blacktop';

export type WrappedPeriod = 'week' | 'month' | 'year' | 'all';
export const WRAPPED_PERIODS: WrappedPeriod[] = ['week', 'month', 'year', 'all'];

export interface WrappedRange {
  period: WrappedPeriod;
  /** The period's own key: a week's Monday (YYYY-MM-DD), YYYY-MM, YYYY, or 'all'. */
  key: string;
  start: number;
  /** Exclusive. */
  end: number;
}

export interface WrappedData extends WrappedRange {
  rides: RideSession[];
  count: number;
  /** Miles. */
  distance: number;
  /** Seconds. */
  duration: number;
  daysRidden: number;
  /** mph over the time riding. */
  averageSpeed: number;
  /** null when no ride in it has one (the caller hides peaks the rider keeps private). */
  topSpeed: number | null;
  maxLean: number | null;
  longest: RideSession | null;
  /** The period before, for comparison (null for all time, or when it had no rides). */
  previous: { distance: number; count: number } | null;
  /** 0 = Monday … 6 = Sunday, the day ridden most (by rides), or null. */
  favouriteDay: number | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  /** Towns ridden through, most visited first. */
  towns: string[];
  badges: Array<{ badge: string; count: number }>;
  convoyRides: number;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The period containing `at` (all time: from the first ride to now). */
export function wrappedRange(period: WrappedPeriod, at: Date, firstRide?: number): WrappedRange {
  if (period === 'all') return { period, key: 'all', start: firstRide ?? 0, end: Date.now() + 1 };
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    return { period, key: dayKey(d), start: d.getTime(), end: end.getTime() };
  }
  if (period === 'month') {
    d.setDate(1);
    const end = new Date(d);
    end.setMonth(end.getMonth() + 1);
    return { period, key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, start: d.getTime(), end: end.getTime() };
  }
  d.setMonth(0, 1);
  const end = new Date(d);
  end.setFullYear(end.getFullYear() + 1);
  return { period, key: String(d.getFullYear()), start: d.getTime(), end: end.getTime() };
}

/** The period just before (none for all time). */
export function previousRange(r: WrappedRange): WrappedRange | null {
  if (r.period === 'all') return null;
  return wrappedRange(r.period, new Date(r.start - DAY_MS));
}

const finished = (rides: RideSession[]) => rides.filter((r) => r.endedAt && r.distance > 0);
const inRange = (rides: RideSession[], r: WrappedRange) =>
  rides.filter((x) => {
    const t = new Date(x.startedAt).getTime();
    return t >= r.start && t < r.end;
  });

export function firstRideAt(rides: RideSession[]): number | undefined {
  const t = finished(rides).map((r) => new Date(r.startedAt).getTime());
  return t.length ? Math.min(...t) : undefined;
}

export function wrapUp(all: RideSession[], range: WrappedRange): WrappedData {
  const done = finished(all);
  const rides = inRange(done, range).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const distance = rides.reduce((s, r) => s + r.distance, 0);
  const duration = rides.reduce((s, r) => s + (r.duration || 0), 0);
  const days = new Set(rides.map((r) => dayKey(new Date(r.startedAt))));
  const tops = rides.map((r) => r.maxSpeed).filter((v) => v > 0);
  const leans = rides.map((r) => Math.max(r.maxLeanLeft || 0, r.maxLeanRight || 0)).filter((v) => v > 0);
  const longest = rides.reduce<RideSession | null>((a, r) => (!a || r.distance > a.distance ? r : a), null);

  const prevRange = previousRange(range);
  const prevRides = prevRange ? inRange(done, prevRange) : [];
  const previous = prevRides.length ? { distance: prevRides.reduce((s, r) => s + r.distance, 0), count: prevRides.length } : null;

  const dayCounts = new Array(7).fill(0);
  const todCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const r of rides) {
    const d = new Date(r.startedAt);
    dayCounts[(d.getDay() + 6) % 7] += 1;
    const h = d.getHours();
    todCounts[h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'] += 1;
  }
  const fav = rides.length ? dayCounts.indexOf(Math.max(...dayCounts)) : null;
  const tod = rides.length ? (Object.entries(todCounts).sort((a, b) => b[1] - a[1])[0][0] as WrappedData['timeOfDay']) : null;

  const towns = new Map<string, number>();
  for (const r of rides) for (const p of r.places ?? []) towns.set(p.name, (towns.get(p.name) ?? 0) + 1);
  const badgeCounts = new Map<string, number>();
  for (const r of rides) for (const b of r.earnedBadges ?? []) badgeCounts.set(b, (badgeCounts.get(b) ?? 0) + 1);

  return {
    ...range,
    rides,
    count: rides.length,
    distance,
    duration,
    daysRidden: days.size,
    averageSpeed: duration > 0 ? distance / (duration / 3600) : 0,
    topSpeed: tops.length ? Math.max(...tops) : null,
    maxLean: leans.length ? Math.max(...leans) : null,
    longest,
    previous,
    favouriteDay: fav,
    timeOfDay: tod,
    towns: [...towns.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
    badges: [...badgeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([badge, count]) => ({ badge, count })),
    convoyRides: rides.filter((r) => r.isConvoyRide).length,
  };
}

// ── New and seen ─────────────────────────────────────────────────────────────

const SEEN_KEY = 'blacktop_wrapped_seen';
type Seen = Partial<Record<'week' | 'month' | 'year', string>>;
const listeners = new Set<() => void>();

function readSeen(): Seen {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Seen) ?? {};
  } catch {
    return {};
  }
}
let seen = readSeen();

/** The last finished week, month and year that had rides, and whether each has been opened. */
export function finishedWraps(rides: RideSession[], now = new Date()): Array<{ range: WrappedRange; isNew: boolean }> {
  const done = finished(rides);
  const out: Array<{ range: WrappedRange; isNew: boolean }> = [];
  for (const period of ['week', 'month', 'year'] as const) {
    const cur = wrappedRange(period, now);
    const last = previousRange(cur)!;
    if (!inRange(done, last).length) continue;
    out.push({ range: last, isNew: seen[period] !== last.key && (seen[period] ?? '') < last.key });
  }
  return out;
}

export function markWrappedSeen(range: WrappedRange) {
  if (range.period === 'all') return;
  if ((seen[range.period] ?? '') >= range.key) return;
  seen = { ...seen, [range.period]: range.key };
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

/** Every finished week, month and year counts as opened (the Console's Clear all). */
export function markAllWrappedSeen(rides: RideSession[]) {
  for (const { range } of finishedWraps(rides)) markWrappedSeen(range);
}

/** Bumps whenever a Wrapped is marked seen (Home's Stats glow, the Stats row). */
export function useWrappedSeen(): Seen {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => seen,
    () => seen,
  );
}
