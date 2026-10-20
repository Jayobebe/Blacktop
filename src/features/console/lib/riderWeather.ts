/**
 * The riding weather on Blacktop Console: one Open-Meteo forecast for where the
 * rider is (free, keyless, not our server: the same service route weather
 * uses), kept on the phone for half an hour (`blacktop_console_weather`, left
 * out of backups: it belongs to the moment), and read into what a rider wants
 * to know before setting off: wet or dry now, when that changes, the best
 * window to ride in, gusts, cold, and the daylight left.
 *
 * Imports nothing heavy: Home reads it for the Console's pip (rain on its way).
 */
import { useEffect, useSyncExternalStore } from 'react';

export interface WeatherHour {
  /** Start of the hour, ms. */
  t: number;
  tempC: number;
  /** Precipitation in the hour, mm. */
  mm: number;
  /** Chance of precipitation, %. */
  prob: number;
  gustKmh: number;
  code: number;
  day: boolean;
}

export interface RiderWeather {
  lat: number;
  lng: number;
  at: number;
  hours: WeatherHour[];
  /** Sunrise and sunset, ms, today and tomorrow. */
  sun: Array<{ rise: number; set: number }>;
}

const KEY = 'blacktop_console_weather';
const FRESH_MS = 30 * 60 * 1000;
/** A forecast for somewhere further than this from the rider is fetched again. */
const MOVED_KM = 10;

let cached: RiderWeather | null = read();
const listeners = new Set<() => void>();

function read(): RiderWeather | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as RiderWeather | null;
    return v && Array.isArray(v.hours) && Array.isArray(v.sun) ? v : null;
  } catch {
    return null;
  }
}

function keep(w: RiderWeather) {
  cached = w;
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

let inFlight: Promise<void> | null = null;

/** Fetch the forecast for `at` unless a fresh one for near there is kept already. */
export function refreshRiderWeather(at: { lat: number; lng: number } | null, force = false): Promise<void> {
  if (!at) return Promise.resolve();
  if (!force && cached && Date.now() - cached.at < FRESH_MS && km(cached, at) < MOVED_KM) return Promise.resolve();
  if (inFlight) return inFlight;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', at.lat.toFixed(2));
  url.searchParams.set('longitude', at.lng.toFixed(2));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_gusts_10m,is_day');
  url.searchParams.set('daily', 'sunrise,sunset');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '2');
  inFlight = fetch(url.toString())
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const h = j?.hourly;
      const d = j?.daily;
      if (!h || !Array.isArray(h.time)) return;
      const hours: WeatherHour[] = h.time.map((t: number, i: number) => ({
        t: t * 1000,
        tempC: h.temperature_2m?.[i] ?? 0,
        mm: h.precipitation?.[i] ?? 0,
        prob: h.precipitation_probability?.[i] ?? 0,
        gustKmh: h.wind_gusts_10m?.[i] ?? 0,
        code: h.weather_code?.[i] ?? 0,
        day: h.is_day?.[i] !== 0,
      }));
      const sun = Array.isArray(d?.sunrise) ? d.sunrise.map((rise: number, i: number) => ({ rise: rise * 1000, set: (d.sunset?.[i] ?? rise) * 1000 })) : [];
      keep({ lat: at.lat, lng: at.lng, at: Date.now(), hours, sun });
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The kept forecast (refreshed for `at` while `active`). */
export function useRiderWeather(at: { lat: number; lng: number } | null, active: boolean): RiderWeather | null {
  const w = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cached,
    () => cached,
  );
  useEffect(() => {
    if (active) void refreshRiderWeather(at);
  }, [active, at?.lat, at?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return w;
}

export const getRiderWeather = () => cached;

// ── Reading it ───────────────────────────────────────────────────────────────

/** Wet enough to matter on two wheels: a few drops in the hour, or likelier than not. */
export const wet = (h: WeatherHour) => h.mm >= 0.2 || h.prob >= 55;
/** A good hour to ride: dry, daylight, above freezing-ish, no gale. */
const good = (h: WeatherHour) => !wet(h) && h.day && h.tempC >= 4 && h.gustKmh < 55;

export interface WeatherRead {
  now: WeatherHour;
  /** The next 12 hours from this one. */
  ahead: WeatherHour[];
  wetNow: boolean;
  /** Dry now: when the rain starts (null: not within 12 h). Wet now: when it stops. */
  change: WeatherHour | null;
  /** The longest run of good riding hours ahead (2 h or more), first and last hour. */
  window: { from: number; to: number } | null;
  /** The strongest gust in the next 6 hours, km/h, when it's worth saying (40+). */
  gustKmh: number | null;
  /** Cold enough for ice in the next 6 hours. */
  icy: boolean;
  sunset: number | null;
  sunrise: number | null;
}

export function readWeather(w: RiderWeather | null, at = Date.now()): WeatherRead | null {
  if (!w) return null;
  const from = w.hours.findIndex((h) => h.t + 3600_000 > at);
  if (from < 0) return null;
  const ahead = w.hours.slice(from, from + 12);
  if (!ahead.length) return null;
  const now = ahead[0];
  const wetNow = wet(now);
  const change = ahead.slice(1).find((h) => wet(h) !== wetNow) ?? null;
  let best: { from: number; to: number } | null = null;
  let run: { from: number; to: number } | null = null;
  for (const h of ahead) {
    if (good(h)) {
      const next: { from: number; to: number } = run ? { from: run.from, to: h.t } : { from: h.t, to: h.t };
      run = next;
      if (!best || next.to - next.from > best.to - best.from) best = { from: next.from, to: next.to };
    } else run = null;
  }
  const six = ahead.slice(0, 6);
  const gust = Math.max(...six.map((h) => h.gustKmh));
  const today = w.sun.find((s) => s.set > at) ?? null;
  return {
    now,
    ahead,
    wetNow,
    change,
    window: best && best.to - best.from >= 3600_000 ? { from: best.from, to: best.to + 3600_000 } : null,
    gustKmh: gust >= 40 ? gust : null,
    icy: six.some((h) => h.tempC <= 2),
    sunset: today && today.rise <= at ? today.set : null,
    sunrise: today && today.rise > at ? today.rise : null,
  };
}

/** Dry now and rain within three hours: the one weather thing worth the Console's pip. */
export function rainSoon(w: RiderWeather | null, at = Date.now()): WeatherHour | null {
  const r = readWeather(w, at);
  if (!r || r.wetNow || !r.change) return null;
  return r.change.t - at <= 3 * 3600_000 ? r.change : null;
}
