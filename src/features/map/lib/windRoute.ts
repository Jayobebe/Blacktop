import type { RouteLineString } from './routing';
import type { VehicleType } from '@/features/experience/lib/vehicles';
import { getExperience } from '@/features/experience/lib/profile';
import { fetchForecast, forecastUrl } from '@/lib/weatherApi';

/**
 * Wind along the route (Settings → Navigation → Wind warnings). Samples the
 * planned line, asks Open-Meteo (free, keyless) for the wind at the hour the
 * rider will reach each point, and works out how much of the gust hits them
 * side-on against the way the road runs there. A forecast is for an area a
 * few kilometres across: it can say "gusty around here", never "this bridge".
 * Advisory only: any failure answers null and nothing shows.
 */

/** Side-gust thresholds in km/h by what the rider rides: [warn, strong]. */
const THRESHOLDS: Record<'motor' | 'pedal' | 'car', [number, number]> = {
  motor: [50, 70],
  pedal: [35, 50],
  car: [80, 100],
};

/** One sample every this many metres, at most MAX_SAMPLES (and at least 2). */
const SPACING_M = 3_000;
const MAX_SAMPLES = 40;
/** Warnings closer than this along the route than the last kept one are folded into it. */
const MERGE_M = 2_000;

export type WindClass = keyof typeof THRESHOLDS;

export function windClassFor(vehicle: VehicleType | undefined): WindClass {
  if (vehicle === 'car') return 'car';
  if (vehicle === 'bicycle' || vehicle === 'ebike' || vehicle === 'escooter') return 'pedal';
  return 'motor';
}

/** The rider's main vehicle's class. */
export function riderWindClass(): WindClass {
  return windClassFor(getExperience().vehicles[0]);
}

/** Whether wind warnings are on: the rider's switch, or until they've touched it, on except for a car. */
export function windWarningsOn(pref: boolean | null | undefined): boolean {
  return pref ?? riderWindClass() !== 'car';
}

export interface WindPoint {
  lat: number;
  lng: number;
  /** Metres along the route from its start. */
  along: number;
  /** When the rider is forecast to be here (ms). */
  etaMs: number;
  speedKmh: number;
  gustKmh: number;
  /** The way the wind blows towards (degrees, 0 = north): what an arrow on the map points along. */
  towards: number;
  /** The side-on part of the gust (km/h). */
  crossKmh: number;
  /** The side it comes from, riding the route. */
  side: 'left' | 'right';
  /** The wind's part along the road (km/h): positive behind the rider, negative in their face. */
  alongKmh: number;
}

export interface WindStretch extends WindPoint {
  level: 'warn' | 'strong';
}

export interface RouteWind {
  points: WindPoint[];
  /** Where the side gusts reach the rider's warning line, the worst of each stretch. */
  stretches: WindStretch[];
  worst: WindStretch | null;
  /** For riders on pedals: mostly into the wind or with it (null: neither, or not asked). */
  headTail: 'head' | 'tail' | null;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function metres(a: [number, number], b: [number, number]) {
  const x = toRad(b[0] - a[0]) * Math.cos(toRad((a[1] + b[1]) / 2));
  const y = toRad(b[1] - a[1]);
  return Math.hypot(x, y) * 6_371_000;
}
function bearing(a: [number, number], b: [number, number]) {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface Sample {
  lat: number;
  lng: number;
  along: number;
  /** The way the road runs here (degrees). */
  heading: number;
}

/** Points along the line every SPACING_M (fewer on a long route), each with the road's heading there. */
function sampleLine(coords: Array<[number, number]>): { samples: Sample[]; total: number } {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  if (coords.length < 2 || total < 50) return { samples: [], total };
  const count = Math.min(MAX_SAMPLES, Math.max(2, Math.round(total / SPACING_M) + 1));
  const samples: Sample[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[j]) / span));
    const [x0, y0] = coords[j];
    const [x1, y1] = coords[j + 1];
    // The road's heading over ~150 m either side, so one kink doesn't set it.
    let a = j;
    while (a > 0 && target - cum[a] < 150) a--;
    let b = j + 1;
    while (b < coords.length - 1 && cum[b] - target < 150) b++;
    samples.push({ lng: x0 + (x1 - x0) * t, lat: y0 + (y1 - y0) * t, along: target, heading: bearing(coords[a], coords[b]) });
  }
  return { samples, total };
}

/** The wind against one point of road: side-on and along parts, and from which side. */
export function windAgainstRoad(heading: number, fromDeg: number, speedKmh: number, gustKmh: number) {
  const towards = (fromDeg + 180) % 360;
  const rel = toRad(towards - heading);
  // Relative to riding the road: the wind from the right blows towards the left.
  const fromRel = ((fromDeg - heading) % 360 + 360) % 360;
  return {
    towards,
    crossKmh: Math.abs(Math.sin(rel)) * gustKmh,
    alongKmh: Math.cos(rel) * speedKmh,
    side: (fromRel > 0 && fromRel < 180 ? 'right' : 'left') as 'left' | 'right',
  };
}

/**
 * The wind the rider will meet along a route, from `startMs` at the route's own
 * pace. Null when the forecast can't be had.
 */
export async function checkRouteWind(
  geometry: RouteLineString,
  durationSeconds: number,
  windClass: WindClass,
  startMs: number = Date.now(),
): Promise<RouteWind | null> {
  const coords = geometry.coordinates as Array<[number, number]>;
  const { samples, total } = sampleLine(coords);
  if (!samples.length) return null;
  try {
    const url = forecastUrl();
    url.searchParams.set('latitude', samples.map((s) => s.lat.toFixed(3)).join(','));
    url.searchParams.set('longitude', samples.map((s) => s.lng.toFixed(3)).join(','));
    url.searchParams.set('hourly', 'wind_speed_10m,wind_gusts_10m,wind_direction_10m');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('timeformat', 'unixtime');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('forecast_days', '2');
    const res = await fetchForecast(url);
    if (!res.ok) return null;
    const json = await res.json();
    const series = Array.isArray(json) ? json : [json];

    const points: WindPoint[] = [];
    samples.forEach((s, i) => {
      const h = series[i]?.hourly;
      const times: number[] | undefined = h?.time;
      if (!times?.length) return;
      const etaMs = startMs + (total ? (s.along / total) * durationSeconds * 1000 : 0);
      const target = etaMs / 1000;
      let best = 0;
      for (let t = 1; t < times.length; t++) if (Math.abs(times[t] - target) < Math.abs(times[best] - target)) best = t;
      const speed = Number(h.wind_speed_10m?.[best]);
      const gust = Number(h.wind_gusts_10m?.[best]);
      const from = Number(h.wind_direction_10m?.[best]);
      if (!Number.isFinite(speed) || !Number.isFinite(from)) return;
      const g = Number.isFinite(gust) ? gust : speed;
      points.push({ lat: s.lat, lng: s.lng, along: s.along, etaMs, speedKmh: speed, gustKmh: g, ...windAgainstRoad(s.heading, from, speed, g) });
    });
    if (!points.length) return null;
    return summarise(points, windClass);
  } catch {
    return null;
  }
}

/** The warning stretches (each the worst point within MERGE_M), the worst of all, and head / tail for pedals. */
export function summarise(points: WindPoint[], windClass: WindClass): RouteWind {
  const [warn, strong] = THRESHOLDS[windClass];
  const stretches: WindStretch[] = [];
  for (const p of points) {
    if (p.crossKmh < warn) continue;
    const s: WindStretch = { ...p, level: p.crossKmh >= strong ? 'strong' : 'warn' };
    const last = stretches[stretches.length - 1];
    if (last && p.along - last.along < MERGE_M) {
      if (s.crossKmh > last.crossKmh) stretches[stretches.length - 1] = s;
    } else stretches.push(s);
  }
  const worst = stretches.reduce<WindStretch | null>((a, b) => (!a || b.crossKmh > a.crossKmh ? b : a), null);
  let headTail: RouteWind['headTail'] = null;
  if (windClass === 'pedal') {
    // Mostly: two thirds of the route with the wind at least 12 km/h along it one way.
    const head = points.filter((p) => p.alongKmh <= -12).length;
    const tail = points.filter((p) => p.alongKmh >= 12).length;
    if (head >= points.length * (2 / 3)) headTail = 'head';
    else if (tail >= points.length * (2 / 3)) headTail = 'tail';
  }
  return { points, stretches, worst, headTail };
}
