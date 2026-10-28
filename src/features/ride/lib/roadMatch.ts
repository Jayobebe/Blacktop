/**
 * A ride's own fixes snapped onto the roads it was on, for the 3D flyover.
 *
 * GPS sits a few metres off the road and wanders on bends, so the flyover's
 * pin and trail drifted off the roads, worst on a fast video (2026-10-28).
 * The `place-search` function's `match` kind runs Valhalla's map matching over
 * the fixes (500 at a time, split at gaps) and answers each one's point on its
 * road, or null where it couldn't be matched; an answer more than 30 m from its
 * fix is taken for the wrong road and left as the fix. Asked once a ride and
 * saved on it (`roadMatch`, aligned to `gpsPoints`, 0 for a fix left as it
 * was), the recorded points never changed: `withRoadMatch` lays it over them
 * when the flyover is built. Offline, the router down, or a function too old to
 * know `match`: nothing saved, asked again next time.
 */
import type { GpsPoint, RideSession } from '@/types/blacktop';
import { supabase } from '@/integrations/supabase/client';
import { getExperience } from '@/features/experience';
import { isDemoModeActive } from '@/lib/demoMode';
import { patchStoredRide } from './rideNames';

export type RoadMatch = Array<[number, number] | 0>;

const CHUNK = 500;
/** Fixes further apart than this are sent in separate pieces (the function refuses a jump over 2 km). */
const SPLIT_M = 1500;
/** A snapped point further than this from its fix is the wrong road. */
const TRUST_M = 30;
/** Longer rides aren't matched (that many requests for one flyover). */
const MAX_FIXES = 12_000;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function vehicle(): 'motorcycle' | 'car' | 'bicycle' {
  const main = getExperience().vehicles[0];
  return main === 'car' ? 'car' : main === 'bicycle' || main === 'ebike' || main === 'escooter' ? 'bicycle' : 'motorcycle';
}

const usable = (p: GpsPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** The ride's fixes on their roads: saved at once, else asked for now and saved; null when it can't be had. */
export async function roadMatchForRide(ride: RideSession): Promise<RoadMatch | null> {
  if (ride.roadMatch) return ride.roadMatch;
  const pts = ride.gpsPoints ?? [];
  if (pts.length < 2 || pts.length > MAX_FIXES) return null;
  // Runs of usable fixes, split at gaps and into pieces the function takes.
  const pieces: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!usable(pts[i])) continue;
    const prev = cur.length ? pts[cur[cur.length - 1]] : null;
    if (cur.length >= CHUNK || (prev && metres(prev, pts[i]) > SPLIT_M)) {
      pieces.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length) pieces.push(cur);
  const out: RoadMatch = pts.map(() => 0);
  const v = vehicle();
  // Two at a time.
  for (let k = 0; k < pieces.length; k += 2) {
    const answers = await Promise.all(
      pieces.slice(k, k + 2).map(async (piece) => {
        if (piece.length < 2) return true;
        const { data, error } = await supabase.functions.invoke('place-search', {
          body: { kind: 'match', points: piece.map((i) => [pts[i].lng, pts[i].lat]), vehicle: v },
        });
        const got = (data as { points?: unknown } | null)?.points;
        if (error || !Array.isArray(got) || got.length !== piece.length) return false;
        piece.forEach((i, j) => {
          const p = got[j];
          if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) return;
          const [lng, lat] = p as [number, number];
          if (metres(pts[i], { lat, lng }) <= TRUST_M) out[i] = [lat, lng];
        });
        return true;
      }),
    );
    if (answers.includes(false)) return null;
  }
  if (!isDemoModeActive()) patchStoredRide(ride.id, { roadMatch: out });
  return out;
}

/** The ride's points with each matched fix moved onto its road (times, speeds and the rest untouched). */
export function withRoadMatch(points: GpsPoint[], match: RoadMatch | null | undefined): GpsPoint[] {
  if (!match || match.length !== points.length) return points;
  return points.map((p, i) => {
    const m = match[i];
    return m ? { ...p, lat: m[0], lng: m[1] } : p;
  });
}
