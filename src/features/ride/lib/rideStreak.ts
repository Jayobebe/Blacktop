/**
 * Ride streaks. Riding on 3+ consecutive days earns a card copy (once per
 * streak run, keyed by the streak's start day). Tracked purely from local
 * ride days — no server state.
 */
import { grantStreakCopy, type GrantResult } from '@/features/cards/lib/dropEconomy';

const DAYS_KEY = 'bt.ride_streak_days.v1';

export const STREAK_COPY_DAYS = 3;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rideDays(): string[] {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Current consecutive-day run ending today (0 if no ride today). */
export function currentStreak(): number {
  const days = new Set(rideDays());
  let streak = 0;
  const d = new Date();
  while (days.has(dayKey(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Records a finished ride's day and, when it completes a fresh 3-day streak,
 * grants a card copy. Returns the grant outcome, or null when no new streak
 * copy was due.
 */
export function recordRideDay(endedAt: Date = new Date()): GrantResult | null {
  const key = dayKey(endedAt);
  const days = rideDays();
  if (!days.includes(key)) {
    try {
      localStorage.setItem(DAYS_KEY, JSON.stringify([...days, key]));
    } catch {
      /* non-fatal */
    }
  }

  // Walk back from the ride day to measure the run it belongs to.
  const all = new Set(rideDays());
  let streak = 0;
  const cursor = new Date(endedAt);
  while (all.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (streak < STREAK_COPY_DAYS) return null;

  // Only grant when this ride is the one that completed the streak —
  // longer runs already paid out on their third day.
  if (streak !== STREAK_COPY_DAYS) return null;

  // The streak run started STREAK_COPY_DAYS - 1 days before the ride day.
  const start = new Date(endedAt);
  start.setDate(start.getDate() - (STREAK_COPY_DAYS - 1));
  return grantStreakCopy(dayKey(start));
}
