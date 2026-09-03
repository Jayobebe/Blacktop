import { fetchRouteThroughStops, RouteResult, RouteLineString } from './routing';

/**
 * Weather-aware routing.
 *
 * Samples a handful of points along the planned route, asks Open-Meteo (free,
 * keyless, CORS-enabled) what the precipitation will be at the time the rider
 * is forecast to be *at* each point, and — if the route runs through heavy
 * weather — searches for a detour that keeps the rider out of it.
 */

export interface WeatherHit {
  lat: number;
  lng: number;
  /** Millimetres of precipitation forecast for that hour. */
  mm: number;
  /** Epoch ms the rider is expected to reach this point. */
  etaMs: number;
  /** Fraction along the route (0-1). */
  progress: number;
}

export interface RouteWeather {
  hits: WeatherHit[];
  worstMm: number;
  worst: WeatherHit | null;
}

/** mm/h at or above this counts as "heavy" and triggers the reroute offer. */
export const HEAVY_MM = 2;
/** A candidate detour has to get below this to count as dry. */
export const DRY_MM = 0.4;

const MAX_SAMPLES = 8;

function sampleRoute(
  geometry: RouteLineString,
  durationSeconds: number,
  startMs: number,
): { lat: number; lng: number; etaMs: number; progress: number }[] {
  const coords = geometry.coordinates;
  if (coords.length < 2) return [];
  const count = Math.min(MAX_SAMPLES, Math.max(2, Math.floor(coords.length / 8)));
  const out: { lat: number; lng: number; etaMs: number; progress: number }[] = [];
  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? 0 : i / (count - 1);
    const [lng, lat] = coords[Math.round(progress * (coords.length - 1))];
    out.push({ lat, lng, etaMs: startMs + progress * durationSeconds * 1000, progress });
  }
  return out;
}

/**
 * Forecast precipitation along the route. Returns null when the forecast is
 * unavailable — weather routing is advisory, never blocking.
 */
export async function checkRouteWeather(
  geometry: RouteLineString,
  durationSeconds: number,
  startMs: number = Date.now(),
): Promise<RouteWeather | null> {
  const samples = sampleRoute(geometry, durationSeconds, startMs);
  if (samples.length === 0) return null;

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', samples.map((s) => s.lat.toFixed(3)).join(','));
    url.searchParams.set('longitude', samples.map((s) => s.lng.toFixed(3)).join(','));
    url.searchParams.set('hourly', 'precipitation');
    url.searchParams.set('timeformat', 'unixtime');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('forecast_days', '2');

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const series = Array.isArray(json) ? json : [json];

    const hits: WeatherHit[] = [];
    samples.forEach((sample, i) => {
      const hourly = series[i]?.hourly;
      const times: number[] | undefined = hourly?.time;
      const precip: number[] | undefined = hourly?.precipitation;
      if (!times?.length || !precip?.length) return;
      const targetSec = sample.etaMs / 1000;
      let bestIdx = 0;
      let bestDelta = Infinity;
      for (let t = 0; t < times.length; t++) {
        const d = Math.abs(times[t] - targetSec);
        if (d < bestDelta) {
          bestDelta = d;
          bestIdx = t;
        }
      }
      const mm = Number(precip[bestIdx]) || 0;
      hits.push({ lat: sample.lat, lng: sample.lng, mm, etaMs: sample.etaMs, progress: sample.progress });
    });

    if (hits.length === 0) return null;
    const worst = hits.reduce((a, b) => (b.mm > a.mm ? b : a), hits[0]);
    return { hits, worstMm: worst.mm, worst };
  } catch {
    return null;
  }
}

function offsetPoint(lat: number, lng: number, bearingDeg: number, distKm: number) {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const dr = distKm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 };
}

function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export interface DryRouteResult {
  route: RouteResult;
  /** Detour via point to insert into the rider's stop list. */
  via: { lat: number; lng: number };
  worstMm: number;
}

/**
 * Looks for a detour around the wet part of the route: try via points pushed
 * perpendicular to the travel direction, on both sides, at increasing offsets,
 * and keep the driest one that still routes.
 */
export async function findDryRoute(
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  intermediate: { lat: number; lng: number }[],
  worst: WeatherHit,
): Promise<DryRouteResult | null> {
  const heading = bearingBetween(start, destination);
  let best: DryRouteResult | null = null;

  for (const distKm of [12, 25, 40]) {
    for (const side of [90, -90]) {
      const via = offsetPoint(worst.lat, worst.lng, heading + side, distKm);
      const route = await fetchRouteThroughStops([start, via, ...intermediate, destination]);
      if (!route) continue;
      const weather = await checkRouteWeather(route.geometry, route.durationSeconds);
      const worstMm = weather?.worstMm ?? 0;
      if (!best || worstMm < best.worstMm) best = { route, via, worstMm };
      if (worstMm < DRY_MM) return best;
    }
  }

  return best;
}
