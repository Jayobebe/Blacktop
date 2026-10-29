/**
 * The riding forecast for the calendar's next 16 days: one Open-Meteo daily
 * forecast for where the rider is (the same free service as the Console's
 * weather), kept three hours (`blacktop_calendar_forecast`, left out of
 * backups), read into a verdict a day: dry, showers, wet, gusty or icy.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { dayKey } from './calendarStore';
import { fetchForecast, forecastUrl } from '@/lib/weatherApi';

export type DayVerdict = 'dry' | 'showers' | 'wet' | 'gusty' | 'icy';

export interface DayWeather {
  day: string;
  code: number;
  maxC: number;
  minC: number;
  /** Rain over the day, mm, and the highest hourly chance of it, %. */
  mm: number;
  prob: number;
  gustKmh: number;
  verdict: DayVerdict;
  /** How good a day to ride, 0 to 100 (for the pick of the week). */
  score: number;
}

interface Kept {
  lat: number;
  lng: number;
  at: number;
  days: DayWeather[];
}

const KEY = 'blacktop_calendar_forecast';
const FRESH_MS = 3 * 3600_000;

function read(): Kept | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Kept | null;
    return v && Array.isArray(v.days) ? v : null;
  } catch {
    return null;
  }
}

let kept: Kept | null = read();
const listeners = new Set<() => void>();

export function verdictOf(d: Omit<DayWeather, 'verdict' | 'score' | 'day'>): DayVerdict {
  if (d.minC <= 1 && (d.mm > 0.2 || d.minC <= -1)) return 'icy';
  if (d.mm >= 4 || d.prob >= 75) return 'wet';
  if (d.mm >= 0.5 || d.prob >= 45) return 'showers';
  if (d.gustKmh >= 55) return 'gusty';
  return 'dry';
}

function scoreOf(d: Omit<DayWeather, 'verdict' | 'score' | 'day'>): number {
  let s = 100;
  s -= Math.min(60, d.mm * 8 + d.prob * 0.4);
  s -= Math.max(0, d.gustKmh - 30) * 0.8;
  s -= d.maxC < 8 ? (8 - d.maxC) * 3 : 0;
  s -= d.maxC > 30 ? (d.maxC - 30) * 2 : 0;
  return Math.max(0, Math.round(s));
}

let busy = false;
export async function refreshDailyForecast(at: { lat: number; lng: number } | null) {
  if (!at || busy) return;
  if (kept && Date.now() - kept.at < FRESH_MS && Math.abs(kept.lat - at.lat) < 0.1 && Math.abs(kept.lng - at.lng) < 0.1) return;
  busy = true;
  try {
    const url = forecastUrl();
    url.searchParams.set('latitude', at.lat.toFixed(2));
    url.searchParams.set('longitude', at.lng.toFixed(2));
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '16');
    const r = await fetchForecast(url);
    if (!r.ok) return;
    const j = await r.json();
    const t = j?.daily?.time as string[] | undefined;
    if (!Array.isArray(t)) return;
    const days: DayWeather[] = t.map((iso, i) => {
      const base = {
        code: j.daily.weather_code?.[i] ?? 0,
        maxC: j.daily.temperature_2m_max?.[i] ?? 0,
        minC: j.daily.temperature_2m_min?.[i] ?? 0,
        mm: j.daily.precipitation_sum?.[i] ?? 0,
        prob: j.daily.precipitation_probability_max?.[i] ?? 0,
        gustKmh: j.daily.wind_gusts_10m_max?.[i] ?? 0,
      };
      // Open-Meteo's daily dates are already the place's own (YYYY-MM-DD).
      return { day: iso, ...base, verdict: verdictOf(base), score: scoreOf(base) };
    });
    kept = { lat: at.lat, lng: at.lng, at: Date.now(), days };
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
    } catch {
      /* this launch only */
    }
    listeners.forEach((l) => l());
  } catch {
    /* offline: the calendar shows no weather */
  } finally {
    busy = false;
  }
}

/** The forecast by day (refreshed for `at` while `active`). */
export function useDailyForecast(at: { lat: number; lng: number } | null, active: boolean): Map<string, DayWeather> {
  const k = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kept,
    () => kept,
  );
  useEffect(() => {
    if (active) void refreshDailyForecast(at);
  }, [active, at?.lat, at?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return mapOf(k);
}

let lastMap: { k: Kept | null; m: Map<string, DayWeather> } = { k: null, m: new Map() };
function mapOf(k: Kept | null) {
  if (lastMap.k !== k) lastMap = { k, m: new Map((k?.days ?? []).map((d) => [d.day, d])) };
  return lastMap.m;
}

/** The best day to ride among the next seven (from today), when one stands out. */
export function pickOfTheWeek(map: Map<string, DayWeather>, today = dayKey(Date.now())): DayWeather | null {
  const next = [...map.values()].filter((d) => d.day >= today).slice(0, 7);
  if (next.length < 3) return null;
  const best = next.reduce((a, b) => (b.score > a.score ? b : a));
  return best.verdict === 'dry' && best.score >= 60 ? best : null;
}
