/**
 * Server copy of the crew challenge programme.
 * KEEP IN SYNC with src/features/crew/challenges.ts (ids, titles, metrics,
 * units, targets and the week/month rotation). Everything is derived from the
 * week / month number, so the app and the server agree without a schedule.
 */

export type ChallengeMetric =
  | 'distance'
  | 'ride_count'
  | 'max_lean'
  | 'corner_score'
  | 'top_speed'
  | 'night_rides'
  | 'longest_ride'

export interface Challenge {
  id: string
  title: string
  metric: ChallengeMetric
  unit: string
  target: number
}

export const CHALLENGES: Challenge[] = [
  { id: 'miles', title: 'Mile Muncher', metric: 'distance', unit: 'mi', target: 200 },
  { id: 'corners', title: 'Corner Carver', metric: 'corner_score', unit: 'pts', target: 80 },
  { id: 'lean', title: 'Knee Down', metric: 'max_lean', unit: '°', target: 45 },
  { id: 'rides', title: 'Always Out', metric: 'ride_count', unit: 'rides', target: 7 },
  { id: 'grand-tour', title: 'Grand Tour', metric: 'distance', unit: 'mi', target: 350 },
  { id: 'sunday-smasher', title: 'Sunday Smasher', metric: 'distance', unit: 'mi', target: 100 },
  { id: 'daily-rider', title: 'Daily Rider', metric: 'ride_count', unit: 'rides', target: 10 },
  { id: 'full-send', title: 'Full Lean Send', metric: 'max_lean', unit: '°', target: 50 },
  { id: 'smooth', title: 'Smooth Operator', metric: 'corner_score', unit: 'pts', target: 90 },
  { id: 'terminal', title: 'Terminal Velocity', metric: 'top_speed', unit: 'mph', target: 100 },
  { id: 'night-owl', title: 'Night Owl', metric: 'night_rides', unit: 'rides', target: 3 },
  { id: 'iron-butt', title: 'Hard Ass', metric: 'longest_ride', unit: 'mi', target: 150 },
]

export interface MonthlyGoal {
  id: string
  title: string
  metric: 'distance' | 'ride_count'
  unit: string
  target: number
}

export const MONTHLY_GOALS: MonthlyGoal[] = [
  { id: 'crew-marathon', title: 'Crew Marathon', metric: 'distance', unit: 'mi', target: 2000 },
  { id: 'crew-century', title: 'Century of Rides', metric: 'ride_count', unit: 'rides', target: 100 },
  { id: 'crew-enduro', title: 'Crew Enduro', metric: 'distance', unit: 'mi', target: 3500 },
  { id: 'crew-swarm', title: 'Swarm Season', metric: 'ride_count', unit: 'rides', target: 150 },
]

/** ISO-8601 week key of a UTC date, e.g. "2026-W36". */
export function weekKeyUTC(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Month key of a UTC date, e.g. "2026-09". */
export function monthKeyUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function challengesForWeek(key: string): [Challenge, Challenge] {
  const n = Number(key.slice(-2)) || 1
  const first = CHALLENGES[n % CHALLENGES.length]
  let idx = (n + 5) % CHALLENGES.length
  let second = CHALLENGES[idx]
  while (second.metric === first.metric) {
    idx = (idx + 1) % CHALLENGES.length
    second = CHALLENGES[idx]
  }
  return [first, second]
}

export function monthlyGoalFor(key: string): MonthlyGoal {
  const month = Number(key.slice(5, 7)) || 1
  return MONTHLY_GOALS[month % MONTHLY_GOALS.length]
}

/** Number of days in the UTC month of `d`. */
export function daysInMonthUTC(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

/**
 * A device's units (push_subscriptions.distance_unit / speed_unit). Null
 * columns (an app from before units were sent) mean miles and mph, as before.
 */
export interface Units {
  distance: 'miles' | 'km'
  speed: 'mph' | 'kph'
  /** False when the device sent none (the defaults stand in). */
  stored?: boolean
}
export const DEFAULT_UNITS: Units = { distance: 'miles', speed: 'mph' }

const KM_PER_MILE = 1.60934

/** Boards store miles and mph: a value and its suffix in these units. */
function inUnits(value: number, unit: string, u: Units): { v: number; unit: string } {
  if (unit === 'mi' && u.distance === 'km') return { v: value * KM_PER_MILE, unit: 'km' }
  if (unit === 'mph' && u.speed === 'kph') return { v: value * KM_PER_MILE, unit: 'kph' }
  return { v: value, unit }
}

/** Score as shown in the app ("212 mi" / "341 km", "7 rides", "48°"). */
export function formatScore(value: number, unit: string, u: Units = DEFAULT_UNITS): string {
  const c = inUnits(value, unit, u)
  // Distances and speeds whole, as the app shows them; lean and points to one place.
  const v = ['mi', 'km', 'mph', 'kph'].includes(c.unit) ? Math.round(c.v) : Math.round(c.v * 10) / 10
  const n = v.toLocaleString('en-GB')
  return c.unit === '°' ? `${n}°` : `${n} ${c.unit}`
}

/** A target as the app shows it: a round figure in km ("560 km", "5,600 km"), otherwise as stored. */
export function formatTarget(target: number, unit: string, u: Units = DEFAULT_UNITS): string {
  const c = inUnits(target, unit, u)
  if (c.unit !== 'km') return formatScore(target, unit, u)
  const step = c.v >= 1000 ? 100 : 10
  return `${(Math.round(c.v / step) * step).toLocaleString('en-GB')} km`
}

/** "10 of 100 rides", "40° of 55°", "212 of 560 km". */
export function formatOf(value: number, target: number, unit: string, u: Units = DEFAULT_UNITS): string {
  const t = formatTarget(target, unit, u)
  if (unit === '°') return `${formatScore(value, unit, u)} of ${t}`
  const suffix = ` ${inUnits(0, unit, u).unit}`
  return `${formatScore(value, unit, u).replace(suffix, '')} of ${t}`
}
