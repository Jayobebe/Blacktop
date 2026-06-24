import { supabase } from '@/integrations/supabase/client';

export interface RouteLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteResult {
  geometry: RouteLineString;
  distanceMeters: number;
  durationSeconds: number;
}

const METERS_PER_MILE = 1609.34;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

// Driving route from `from` to `to` via the place-search edge function
// (which proxies OSRM with auth + rate limiting). Returns null on any failure
// so the map can drop a marker without a line rather than erroring.
export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: {
        kind: 'route',
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    });
    if (error) throw error;

    const geometry = data?.geometry as RouteLineString | undefined;
    if (!geometry?.coordinates?.length || typeof data.distance !== 'number') return null;

    return {
      geometry,
      distanceMeters: data.distance,
      durationSeconds: data.duration,
    };
  } catch (err) {
    console.error('Map routing failed:', err);
    return null;
  }
}
