/**
 * Weekly crew challenges. The challenge for a given week is derived from the
 * ISO week number, so every rider in every crew sees the same one without any
 * server-side scheduling.
 */

export type ChallengeMetric = 'distance' | 'ride_count' | 'max_lean' | 'corner_score';

export interface Challenge {
  id: string;
  title: string;
  blurb: string;
  metric: ChallengeMetric;
  /** Suffix used when rendering a score. */
  unit: string;
  /** A "good effort" target, used for the progress bar only. */
  target: number;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'miles',
    title: 'Mile Muncher',
    blurb: 'Most miles ridden this week.',
    metric: 'distance',
    unit: 'mi',
    target: 200,
  },
  {
    id: 'corners',
    title: 'Corner Carver',
    blurb: 'Best average corner score across the week.',
    metric: 'corner_score',
    unit: 'pts',
    target: 80,
  },
  {
    id: 'lean',
    title: 'Knee Down',
    blurb: 'Deepest lean angle of the week.',
    metric: 'max_lean',
    unit: '°',
    target: 45,
  },
  {
    id: 'rides',
    title: 'Always Out',
    blurb: 'Most rides logged this week.',
    metric: 'ride_count',
    unit: 'rides',
    target: 7,
  },
];

/** ISO-8601 week key, e.g. "2026-W36". */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 local time for the week containing `d`. */
export function weekStart(d: Date = new Date()): Date {
  const start = new Date(d);
  const day = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function challengeForWeek(key = weekKey()): Challenge {
  const n = Number(key.slice(-2)) || 1;
  return CHALLENGES[n % CHALLENGES.length];
}

export function daysLeftInWeek(now: Date = new Date()): number {
  const end = weekStart(now);
  end.setDate(end.getDate() + 7);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}
