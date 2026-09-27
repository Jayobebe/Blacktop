import { supabase } from '@/integrations/supabase/client';

export interface RouteLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

/** One OSRM manoeuvre (turn, roundabout, arrival…) on a leg. */
export interface RouteStep {
  type: string;
  modifier: string | null;
  /** Roundabout exit number, when there is one. */
  exit: number | null;
  /** [lng, lat] of the manoeuvre. */
  location: [number, number] | null;
  name: string;
  ref: string;
  destinations: string;
  rotary: string;
  /** Which side of the road traffic drives on here. */
  side?: 'left' | 'right';
  /** Distance and time from this manoeuvre to the next one. */
  distance: number;
  duration: number;
}

export interface RouteLeg {
  distance: number;
  duration: number;
  steps: RouteStep[];
}

export interface RouteResult {
  geometry: RouteLineString;
  distanceMeters: number;
  durationSeconds: number;
  /** One leg per stop-to-stop hop, present when turn-by-turn was asked for. */
  legs?: RouteLeg[];
}

const METERS_PER_MILE = 1609.34;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

// Driving route through an ordered list of stops, via the place-search edge
// function (which proxies OSRM with auth + rate limiting). Each stop is just
// {lat,lng} - the only thing we ever send over the wire for routing, whether
// that's this request or the Realtime broadcast that triggers it. Returns
// null on any failure so the map can drop a marker without a line rather
// than erroring.
export async function fetchRouteThroughStops(
  stops: { lat: number; lng: number }[],
  opts: { steps?: boolean } = {},
): Promise<RouteResult | null> {
  if (stops.length < 2) return null;
  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: {
        kind: 'route',
        coordinates: stops.map(s => [s.lng, s.lat]),
        ...(opts.steps ? { steps: true } : {}),
      },
    });
    if (error) throw error;

    const geometry = data?.geometry as RouteLineString | undefined;
    if (!geometry?.coordinates?.length || typeof data.distance !== 'number') return null;

    return {
      geometry,
      distanceMeters: data.distance,
      durationSeconds: data.duration,
      // Older deployments of the function don't send legs; the route still draws.
      ...(Array.isArray(data.legs) ? { legs: data.legs as RouteLeg[] } : {}),
    };
  } catch (err) {
    console.error('Map routing failed:', err);
    return null;
  }
}

export type LoopVibe = 'curvy' | 'scenic' | 'relaxed';

export interface LoopRouteResult extends RouteResult {
  /** Generated via points, in ride order (start/end is the rider's location). */
  stops: { lat: number; lng: number }[];
  /** Degrees of heading change per km — higher means twistier. */
  curviness: number;
  vibe: LoopVibe;
}

// Generates a round-trip "give me a 90-minute loop" ride from the rider's
// position: the backend builds a few candidate loops through OSRM and returns
// the one that best matches the requested vibe and distance.
export async function generateLoopRoute(
  start: { lat: number; lng: number },
  distanceKm: number,
  vibe: LoopVibe,
): Promise<LoopRouteResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: { kind: 'loop', lat: start.lat, lng: start.lng, distanceKm, vibe },
    });
    if (error) throw error;
    const geometry = data?.geometry as RouteLineString | undefined;
    if (!geometry?.coordinates?.length || typeof data.distance !== 'number') return null;
    return {
      geometry,
      distanceMeters: data.distance,
      durationSeconds: data.duration,
      stops: Array.isArray(data.stops) ? data.stops : [],
      curviness: typeof data.curviness === 'number' ? data.curviness : 0,
      vibe: data.vibe ?? vibe,
    };
  } catch (err) {
    console.error('Loop generation failed:', err);
    return null;
  }
}

export interface RoutePlanOption {
  distanceMeters: number;
  durationSeconds: number;
  curviness: number;
  /** Extra via point that makes the route twisty (direct routes have none). */
  via?: { lat: number; lng: number };
}

export interface RoutePlan {
  direct: RoutePlanOption;
  twisty: RoutePlanOption | null;
}

// Compares the fastest way to the destination against a twistier line through
// the backroads, so the rider can pick before the ride starts.
export async function planRouteOptions(
  stops: { lat: number; lng: number }[],
): Promise<RoutePlan | null> {
  if (stops.length < 2) return null;
  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: { kind: 'twisty', coordinates: stops.map(s => [s.lng, s.lat]) },
    });
    if (error) throw error;
    if (!data?.direct || typeof data.direct.duration !== 'number') return null;
    const toOption = (o: any): RoutePlanOption => ({
      distanceMeters: o.distance,
      durationSeconds: o.duration,
      curviness: o.curviness ?? 0,
      via: o.via,
    });
    return {
      direct: toOption(data.direct),
      twisty: data.twisty ? toOption(data.twisty) : null,
    };
  } catch (err) {
    console.error('Route planning failed:', err);
    return null;
  }
}
