import { supabase } from '@/integrations/supabase/client';
import { getExperience } from '@/features/experience';

/**
 * The rider's route preferences (Settings → Navigation) and what they ride,
 * sent with every routing request. With any avoid-preference on, or on a
 * bicycle, the server routes with Valhalla (which honours them and has a
 * proper bike profile); otherwise with OSRM.
 */
function routePrefs(): { avoid?: Record<string, boolean>; vehicle: 'motorcycle' | 'car' | 'bicycle' } {
  let s: Record<string, unknown> = {};
  try {
    s = JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}') ?? {};
  } catch {
    /* defaults */
  }
  const avoid = {
    motorways: s.navAvoidMotorways === true,
    tolls: s.navAvoidTolls === true,
    ferries: s.navAvoidFerries === true,
    unpaved: s.navAvoidUnpaved === true,
  };
  const primary = getExperience().vehicles[0];
  const vehicle = primary === 'car' ? 'car' : primary === 'bicycle' || primary === 'ebike' || primary === 'escooter' ? 'bicycle' : 'motorcycle';
  return { ...(Object.values(avoid).some(Boolean) ? { avoid } : {}), vehicle };
}

/** Changes whenever the preferences that shape a route do (for callers that cache routes). */
export function routePrefsKey(): string {
  return JSON.stringify(routePrefs());
}

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
        ...routePrefs(),
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
  /** Generated via points, in ride order (start/end is the rider's location). Scenic loops name the viewpoints they go through. */
  stops: { lat: number; lng: number; name?: string }[];
  /** Degrees of bend per km on open roads (junction turns barely count) — higher is twistier. */
  curviness: number;
  /** Share of the loop on motorways / fast dual carriageways, 0-100. */
  motorwayPct: number;
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
      body: { kind: 'loop', lat: start.lat, lng: start.lng, distanceKm, vibe, ...routePrefs() },
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
      motorwayPct: typeof data.motorwayPct === 'number' ? data.motorwayPct : 0,
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
  /** Via points that make the route twisty: one bend, or two for an S (direct routes have none). */
  vias?: { lat: number; lng: number }[];
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
      body: { kind: 'twisty', coordinates: stops.map(s => [s.lng, s.lat]), ...routePrefs() },
    });
    if (error) throw error;
    if (!data?.direct || typeof data.direct.duration !== 'number') return null;
    const toOption = (o: any): RoutePlanOption => ({
      distanceMeters: o.distance,
      durationSeconds: o.duration,
      curviness: o.curviness ?? 0,
      vias: Array.isArray(o.vias) && o.vias.length ? o.vias : o.via ? [o.via] : undefined,
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
