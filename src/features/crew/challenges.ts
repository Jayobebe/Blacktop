/**
 * Weekly crew challenges and the monthly crew goal. Everything is derived from
 * the ISO week / month numbers, so every rider in every crew sees the same
 * programme without any server-side scheduling.
 */

export type ChallengeMetric =
  | 'distance'
  | 'ride_count'
  | 'max_lean'
  | 'corner_score'
  | 'top_speed'
  | 'night_rides'
  | 'longest_ride';

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
  { id: 'miles', title: 'Mile Muncher', blurb: 'Most miles ridden this week.', metric: 'distance', unit: 'mi', target: 200 },
  { id: 'corners', title: 'Corner Carver', blurb: 'Best average corner score across the week.', metric: 'corner_score', unit: 'pts', target: 80 },
  { id: 'lean', title: 'Knee Down', blurb: 'Deepest lean angle of the week.', metric: 'max_lean', unit: '°', target: 45 },
  { id: 'rides', title: 'Always Out', blurb: 'Most rides logged this week.', metric: 'ride_count', unit: 'rides', target: 7 },
  { id: 'grand-tour', title: 'Grand Tour', blurb: 'Rack up the big miles — 350 or bust.', metric: 'distance', unit: 'mi', target: 350 },
  { id: 'sunday-smasher', title: 'Sunday Smasher', blurb: 'A quick-hit distance dash. 100 miles takes it.', metric: 'distance', unit: 'mi', target: 100 },
  { id: 'daily-rider', title: 'Daily Rider', blurb: 'Ride every single day. 10 rides this week.', metric: 'ride_count', unit: 'rides', target: 10 },
  { id: 'full-send', title: 'Full Lean Send', blurb: 'Push past 55° of lean.', metric: 'max_lean', unit: '°', target: 55 },
  { id: 'smooth', title: 'Smooth Operator', blurb: 'Silky inputs only — average corner score of 90+.', metric: 'corner_score', unit: 'pts', target: 90 },
  { id: 'terminal', title: 'Terminal Velocity', blurb: 'Highest top speed of the week.', metric: 'top_speed', unit: 'mph', target: 100 },
  { id: 'night-owl', title: 'Night Owl', blurb: 'Most rides started after 8pm or before 5am.', metric: 'night_rides', unit: 'rides', target: 3 },
  { id: 'iron-butt', title: 'Hard Ass', blurb: 'Longest single ride this week.', metric: 'longest_ride', unit: 'mi', target: 150 },
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

/** Month key, e.g. "2026-09". */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Monday 00:00 local time for the week containing `d`. */
export function weekStart(d: Date = new Date()): Date {
  const start = new Date(d);
  const day = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Single challenge for a week (kept for compatibility). */
export function challengeForWeek(key = weekKey()): Challenge {
  const n = Number(key.slice(-2)) || 1;
  return CHALLENGES[n % CHALLENGES.length];
}

/** The two deterministic, distinct-metric challenges running this week. */
export function challengesForWeek(key = weekKey()): [Challenge, Challenge] {
  const n = Number(key.slice(-2)) || 1;
  const first = CHALLENGES[n % CHALLENGES.length];
  // Walk forward until we land on a different metric.
  let idx = (n + 5) % CHALLENGES.length;
  let second = CHALLENGES[idx];
  while (second.metric === first.metric) {
    idx = (idx + 1) % CHALLENGES.length;
    second = CHALLENGES[idx];
  }
  return [first, second];
}

export interface SpecialEvent {
  name: string;
  blurb: string;
}

/** Week number (1-53) extracted from a week key. */
function weekNumber(key: string): number {
  return Number(key.slice(-2)) || 1;
}

/**
 * Themed special event for notable weeks: week 1 of the year, the first week
 * of each quarter-ish (weeks 1, 13, 26, 39) and mid-summer/mid-winter.
 */
export function specialForWeek(key = weekKey()): SpecialEvent | null {
  const w = weekNumber(key);
  if (w === 1) return { name: 'New Year, New Roads', blurb: 'Special event week — boosted targets, boosted glory.' };
  if (w === 13) return { name: 'Spring Shakedown', blurb: 'Special event week — blow the winter cobwebs out.' };
  if (w === 26) return { name: 'Solstice Send', blurb: 'Special event week — longest days, longest rides.' };
  if (w === 39) return { name: 'Autumn Attack', blurb: 'Special event week — last of the warm tarmac.' };
  if (w === 52) return { name: 'Last Blast', blurb: 'Special event week — end the year on the throttle.' };
  return null;
}

// ── Monthly crew goal (Forzathon-style) ──────────────────────────────────────

export interface MonthlyGoal {
  id: string;
  title: string;
  blurb: string;
  metric: 'distance' | 'ride_count';
  unit: string;
  /** Crew-wide combined target for the month. */
  target: number;
}

export const MONTHLY_GOALS: MonthlyGoal[] = [
  { id: 'crew-marathon', title: 'Crew Marathon', blurb: 'Your crew rides 2,000 combined miles this month.', metric: 'distance', unit: 'mi', target: 2000 },
  { id: 'crew-century', title: 'Century of Rides', blurb: 'Your crew logs 100 rides between you this month.', metric: 'ride_count', unit: 'rides', target: 100 },
  { id: 'crew-enduro', title: 'Crew Enduro', blurb: 'Your crew rides 3,500 combined miles this month.', metric: 'distance', unit: 'mi', target: 3500 },
  { id: 'crew-swarm', title: 'Swarm Season', blurb: 'Your crew logs 150 rides between you this month.', metric: 'ride_count', unit: 'rides', target: 150 },
];

export function monthlyGoalFor(key = monthKey()): MonthlyGoal {
  const month = Number(key.slice(5, 7)) || 1;
  return MONTHLY_GOALS[month % MONTHLY_GOALS.length];
}

export function daysLeftInMonth(now: Date = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

export function daysLeftInWeek(now: Date = new Date()): number {
  const end = weekStart(now);
  end.setDate(end.getDate() + 7);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}
