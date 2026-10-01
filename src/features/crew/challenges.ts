import { tr } from '@/lib/i18n';
import type { DistanceUnit, SpeedUnit } from '@/features/settings';
/**
 * Weekly crew challenges and the monthly crew goal. Everything is derived from
 * the ISO week / month numbers, so every rider in every crew sees the same
 * programme without any server-side scheduling.
 *
 * The notifications server keeps a copy (supabase/functions/send-push/crew.ts)
 * to announce results: keep the two in sync.
 *
 * Boards store miles and mph; everything shown converts to the rider's units
 * (`challengeScore`, the blurbs' targets).
 */

/** The rider's units (Settings), for scores and targets. */
export type CrewUnits = { distance: DistanceUnit; speed: SpeedUnit };

const KM_PER_MILE = 1.60934;
const distLabel = (u: CrewUnits) => (u.distance === 'km' ? 'km' : 'mi');
const speedLabel = (u: CrewUnits) => (u.speed === 'kph' ? 'kph' : 'mph');
const inDistance = (miles: number, u: CrewUnits) => (u.distance === 'km' ? miles * KM_PER_MILE : miles);

/** A target distance in the rider's units, kept a round figure ("350 mi", "560 km", "3,200 km"). */
export function targetDistance(miles: number, u: CrewUnits): string {
  const v = inDistance(miles, u);
  const step = u.distance !== 'km' ? 1 : v >= 1000 ? 100 : 10;
  return `${(Math.round(v / step) * step).toLocaleString()} ${distLabel(u)}`;
}

/** A score as shown, in the rider's units: "212.4 mi" / "341.8 km", "104 mph", "48°", "7 rides", "82 pts". */
export function challengeScore(metric: ChallengeMetric | 'month_distance', v: number, u: CrewUnits): string {
  switch (metric) {
    case 'distance':
    case 'longest_ride':
      return `${inDistance(v, u).toFixed(1)} ${distLabel(u)}`;
    case 'month_distance':
      return `${Math.round(inDistance(v, u)).toLocaleString()} ${distLabel(u)}`;
    case 'top_speed':
      return `${Math.round(u.speed === 'kph' ? v * KM_PER_MILE : v)} ${speedLabel(u)}`;
    case 'max_lean':
      return `${Math.round(v)}°`;
    case 'corner_score':
      return tr("{0} pts", [Math.round(v)]);
    default: {
      const n = Math.round(v);
      return n === 1 ? tr("1 ride") : tr("{0} rides", [n]);
    }
  }
}

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
  blurb: (u: CrewUnits) => string;
  metric: ChallengeMetric;
  /** The stored unit (mirrors send-push/crew.ts); shown through challengeScore. */
  unit: string;
  /** A "good effort" target, used for the progress bar only. */
  target: number;
}

export const CHALLENGES: Challenge[] = [
  { id: 'miles', title: tr("Mile Muncher"), blurb: () => tr("Most distance ridden this week."), metric: 'distance', unit: 'mi', target: 200 },
  { id: 'corners', title: tr("Corner Carver"), blurb: () => tr("Best average corner score across the week."), metric: 'corner_score', unit: 'pts', target: 80 },
  { id: 'lean', title: tr("Knee Down"), blurb: () => tr("Deepest lean angle of the week."), metric: 'max_lean', unit: '°', target: 45 },
  { id: 'rides', title: tr("Always Out"), blurb: () => tr("Most rides logged this week."), metric: 'ride_count', unit: 'rides', target: 7 },
  { id: 'grand-tour', title: tr("Grand Tour"), blurb: (u) => tr("Rack up the big distance: {0} or bust.", [targetDistance(350, u)]), metric: 'distance', unit: 'mi', target: 350 },
  { id: 'sunday-smasher', title: tr("Sunday Smasher"), blurb: (u) => tr("A quick-hit distance dash. {0} takes it.", [targetDistance(100, u)]), metric: 'distance', unit: 'mi', target: 100 },
  { id: 'daily-rider', title: tr("Daily Rider"), blurb: () => tr("Ride every single day. 10 rides this week."), metric: 'ride_count', unit: 'rides', target: 10 },
  { id: 'full-send', title: tr("Full Lean Send"), blurb: () => tr("Push past 50° of lean."), metric: 'max_lean', unit: '°', target: 50 },
  { id: 'smooth', title: tr("Smooth Operator"), blurb: () => tr("Silky inputs only — average corner score of 90+."), metric: 'corner_score', unit: 'pts', target: 90 },
  { id: 'terminal', title: tr("Terminal Velocity"), blurb: () => tr("Highest top speed of the week."), metric: 'top_speed', unit: 'mph', target: 100 },
  { id: 'night-owl', title: tr("Night Owl"), blurb: () => tr("Most rides started after 8pm or before 5am."), metric: 'night_rides', unit: 'rides', target: 3 },
  { id: 'iron-butt', title: tr("Hard Ass"), blurb: () => tr("Longest single ride this week."), metric: 'longest_ride', unit: 'mi', target: 150 },
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
  if (w === 1) return { name: tr("New Year, New Roads"), blurb: tr("Special event week — boosted targets, boosted glory.") };
  if (w === 13) return { name: tr("Spring Shakedown"), blurb: tr("Special event week — blow the winter cobwebs out.") };
  if (w === 26) return { name: tr("Solstice Send"), blurb: tr("Special event week — longest days, longest rides.") };
  if (w === 39) return { name: tr("Autumn Attack"), blurb: tr("Special event week — last of the warm tarmac.") };
  if (w === 52) return { name: tr("Last Blast"), blurb: tr("Special event week — end the year on the throttle.") };
  return null;
}

// ── Monthly crew goal (Forzathon-style) ──────────────────────────────────────

export interface MonthlyGoal {
  id: string;
  title: string;
  blurb: (u: CrewUnits) => string;
  metric: 'distance' | 'ride_count';
  unit: string;
  /** Crew-wide combined target for the month. */
  target: number;
}

export const MONTHLY_GOALS: MonthlyGoal[] = [
  { id: 'crew-marathon', title: tr("Crew Marathon"), blurb: (u) => tr("Your crew rides {0} combined this month.", [targetDistance(2000, u)]), metric: 'distance', unit: 'mi', target: 2000 },
  { id: 'crew-century', title: tr("Century of Rides"), blurb: () => tr("Your crew logs 100 rides between you this month."), metric: 'ride_count', unit: 'rides', target: 100 },
  { id: 'crew-enduro', title: tr("Crew Enduro"), blurb: (u) => tr("Your crew rides {0} combined this month.", [targetDistance(3500, u)]), metric: 'distance', unit: 'mi', target: 3500 },
  { id: 'crew-swarm', title: tr("Swarm Season"), blurb: () => tr("Your crew logs 150 rides between you this month."), metric: 'ride_count', unit: 'rides', target: 150 },
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
