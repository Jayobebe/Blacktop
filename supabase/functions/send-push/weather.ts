import type { PushMessage } from './deliver.ts'

/**
 * "Heavy weather inbound": reads an Open-Meteo hourly forecast for the next
 * few hours at a rider's (rounded) location and picks out anything worth
 * warning a rider about.
 */

export type WeatherKind = 'thunderstorm' | 'freezing' | 'snow' | 'heavy_rain' | 'wind'

export interface HourlyForecast {
  time: number[] // unix seconds, start of each hour
  precipitation: (number | null)[] // mm in that hour
  weather_code: (number | null)[] // WMO code
  wind_gusts_10m: (number | null)[] // km/h
}

export interface WeatherAlert {
  /** The most severe hazard in the window. */
  kind: WeatherKind
  /** Start of the first hour of that hazard (unix seconds). */
  at: number
  /** A lesser hazard that arrives before it, if any. */
  before: WeatherKind | null
  maxGustKmh: number
  maxMm: number
}

/** Most severe first. */
const SEVERITY: WeatherKind[] = ['thunderstorm', 'freezing', 'snow', 'heavy_rain', 'wind']

const HEAVY_RAIN_MM = 5
const STRONG_GUST_KMH = 65

export function classifyHour(code: number | null, mm: number | null, gustKmh: number | null): WeatherKind | null {
  const c = code ?? -1
  if (c === 95 || c === 96 || c === 99) return 'thunderstorm'
  if (c === 56 || c === 57 || c === 66 || c === 67) return 'freezing'
  if (c === 73 || c === 75 || c === 86) return 'snow'
  if (c === 65 || c === 82 || (mm ?? 0) >= HEAVY_RAIN_MM) return 'heavy_rain'
  if ((gustKmh ?? 0) >= STRONG_GUST_KMH) return 'wind'
  return null
}

/** Hazardous weather from the current hour up to `windowHours` ahead, if any. */
export function findAlert(h: HourlyForecast, nowSec: number, windowHours = 3): WeatherAlert | null {
  const firstOf = new Map<WeatherKind, number>()
  let maxGust = 0
  let maxMm = 0
  for (let i = 0; i < (h.time?.length ?? 0); i++) {
    const t = h.time[i]
    if (t + 3600 <= nowSec || t > nowSec + windowHours * 3600) continue
    const kind = classifyHour(h.weather_code?.[i] ?? null, h.precipitation?.[i] ?? null, h.wind_gusts_10m?.[i] ?? null)
    maxGust = Math.max(maxGust, h.wind_gusts_10m?.[i] ?? 0)
    maxMm = Math.max(maxMm, h.precipitation?.[i] ?? 0)
    if (kind && !firstOf.has(kind)) firstOf.set(kind, t)
  }
  const worst = SEVERITY.find((k) => firstOf.has(k))
  if (!worst) return null
  const at = firstOf.get(worst)!
  // Anything milder that turns up earlier gets a mention.
  let before: WeatherKind | null = null
  for (const [k, t] of firstOf) if (t < at && (before === null || t < firstOf.get(before)!)) before = k
  return { kind: worst, at, before, maxGustKmh: Math.round(maxGust), maxMm: Math.round(maxMm * 10) / 10 }
}

const TITLES: Record<WeatherKind, string> = {
  thunderstorm: '⛈️ Thunderstorms heading your way',
  freezing: '🧊 Freezing rain heading your way',
  snow: '❄️ Snow heading your way',
  heavy_rain: '🌧️ Heavy rain heading your way',
  wind: '💨 Strong winds heading your way',
}

const BEFORE: Record<WeatherKind, string> = {
  thunderstorm: 'Thunderstorms',
  freezing: 'Freezing rain',
  snow: 'Snow',
  heavy_rain: 'Heavy rain',
  wind: 'Strong winds',
}

export function weatherMessage(a: WeatherAlert, nowSec: number, areaKey: string): PushMessage {
  const minutes = (a.at - nowSec) / 60
  const when = minutes <= 45 ? 'within the hour' : minutes < 90 ? 'in about an hour' : `in about ${Math.round(minutes / 60)} hours`
  const extras: string[] = []
  if (a.before) extras.push(`${BEFORE[a.before]} before that.`)
  if (a.maxGustKmh >= 50) extras.push(`Gusts up to ${a.maxGustKmh} km/h (${Math.round(a.maxGustKmh / 1.609)} mph).`)
  if (a.kind === 'heavy_rain' && a.maxMm >= HEAVY_RAIN_MM) extras.push(`Up to ${a.maxMm} mm an hour.`)
  return {
    title: TITLES[a.kind],
    body: [`Expected ${when} around your last location.`, ...extras].join(' '),
    tag: `weather-${areaKey}`,
    url: '/',
  }
}
