/**
 * Gaps in a ride's GPS, filled with the road between them, for the flyover.
 *
 * A web app on an iPhone stops getting fixes while the screen is locked, so a
 * ride can jump hundreds of metres or kilometres from one fix to the next; the
 * flyover drew those as straight lines over fields and houses. Each gap over
 * GAP_M is asked of the router once (the rider's own vehicle and preferences,
 * as for any route), kept only when the road it finds is a believable way
 * between the two fixes, and saved on the ride (`roadGaps`, with `roadChecked`
 * so a ride with none isn't asked again). The recorded points are never
 * changed: `withRoadGaps` lays the roads in between when the flyover is built.
 */
import type { GpsPoint, RideSession } from '@/types/blacktop';
import { fetchRouteThroughStops } from '@/features/map/lib/routing';
import { isDemoModeActive } from '@/lib/demoMode';
import { patchStoredRide } from './rideNames';

export interface RoadGap {
  /** Index into the ride's own points: the road runs from this point to the next. */
  after: number;
  /** The road's line between them, [lng, lat], ends left out. */
  path: Array<[number, number]>;
}

/** A gap this long between two fixes is filled. */
const GAP_M = 150;
/** At most this many asked for a ride (the longest first). */
const MAX_GAPS = 30;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const usable = (p: GpsPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** The ride's gaps filled with roads: saved ones at once, else asked for now and saved. */
export async function roadGapsForRide(ride: RideSession): Promise<RoadGap[]> {
  if (ride.roadGaps) return ride.roadGaps;
  if (ride.roadChecked) return [];
  const pts = ride.gpsPoints ?? [];
  const gaps: Array<{ i: number; d: number }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (!usable(pts[i]) || !usable(pts[i + 1])) continue;
    const d = metres(pts[i], pts[i + 1]);
    if (d > GAP_M) gaps.push({ i, d });
  }
  const asked = gaps.sort((a, b) => b.d - a.d).slice(0, MAX_GAPS);
  const found: RoadGap[] = [];
  let failed = false;
  // A few at a time, so a long ride doesn't send thirty requests at once.
  for (let k = 0; k < asked.length; k += 3) {
    await Promise.all(
      asked.slice(k, k + 3).map(async ({ i, d }) => {
        const a = pts[i];
        const b = pts[i + 1];
        const route = await fetchRouteThroughStops([a, b], { quiet: true });
        if (!route) {
          failed = true;
          return;
        }
        // Only a believable way between them: not a long way round (the fixes were wrong, or it went off road).
        if (route.distanceMeters > Math.max(d * 2.5, d + 400)) return;
        const coords = route.geometry.coordinates as Array<[number, number]>;
        if (coords.length > 2) found.push({ after: i, path: coords.slice(1, -1) });
      }),
    );
  }
  found.sort((x, y) => x.after - y.after);
  // Offline or the router down: try again next time rather than remembering nothing was found.
  if (!failed && !isDemoModeActive()) patchStoredRide(ride.id, { roadGaps: found.length ? found : undefined, roadChecked: true });
  return found;
}

/**
 * The ride's points with each gap's road laid in: times and speeds shared out
 * along the road by distance, so the flyover keeps the ride's own pace.
 */
export function withRoadGaps(points: GpsPoint[], gaps: RoadGap[]): GpsPoint[] {
  if (!gaps.length) return points;
  const byIndex = new Map(gaps.map((g) => [g.after, g.path]));
  const out: GpsPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    out.push(a);
    const path = byIndex.get(i);
    const b = points[i + 1];
    if (!path || !b) continue;
    const line = [a, ...path.map(([lng, lat]) => ({ lat, lng })), b];
    const cum = [0];
    for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + metres(line[k - 1], line[k]));
    const total = cum[cum.length - 1] || 1;
    for (let k = 1; k < line.length - 1; k++) {
      const f = cum[k] / total;
      out.push({
        lat: line[k].lat,
        lng: line[k].lng,
        timestamp: a.timestamp + (b.timestamp - a.timestamp) * f,
        speed: (a.speed ?? 0) + ((b.speed ?? 0) - (a.speed ?? 0)) * f,
      });
    }
  }
  return out;
}
