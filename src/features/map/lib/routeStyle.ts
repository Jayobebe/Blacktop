/**
 * The two ways to somewhere a place card offers (the map's orbit card, the
 * route planner's): Direct, the router's own line, and Twisty, the planner's
 * bendier one (`planRouteOptions`, the lobbies' choice), ridden through its via
 * points as "Twisty leg" stops (one bend, or two for an S).
 */
import { tr } from '@/lib/i18n';
import { planRouteOptions } from './routing';

export type RouteStyle = 'direct' | 'twisty';

/** The via points that make the way through these points twisty (null: none found, or Direct). */
export async function routeStyleVias(style: RouteStyle, points: { lat: number; lng: number }[]): Promise<{ lat: number; lng: number }[] | null> {
  if (style !== 'twisty' || points.length < 2) return null;
  const plan = await planRouteOptions(points);
  const vias = plan?.twisty?.vias;
  return vias?.length ? vias.map((v) => ({ lat: v.lat, lng: v.lng })) : null;
}

/** Via points as stops on a route. */
export const twistyLegs = (vias: { lat: number; lng: number }[] | null) => (vias ?? []).map((v) => ({ lat: v.lat, lng: v.lng, name: tr("Twisty leg") }));

/** A stop that only shapes the route (a twisty pick's bend). */
export const isTwistyLeg = (name?: string) => !!name && (name === tr("Twisty leg") || name === 'Twisty leg');
