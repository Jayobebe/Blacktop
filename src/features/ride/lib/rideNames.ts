import { supabase } from '@/integrations/supabase/client';
import { tr } from '@/lib/i18n';
import { isDemoModeActive } from '@/lib/demoMode';
import { getExperience } from '@/features/experience/lib/profile';
import type { GpsPoint, RideSession } from '@/types/blacktop';
import { RIDES_KEY } from './tripBurner';

/**
 * Names for rides and the places along them, from the map's own reverse
 * lookup (place-search `reverse`, at town level). Nothing about the ride
 * leaves the phone but the few points looked up. Names are kept on the phone
 * (`blacktop_place_names`, a cache: left out of backups), so a place is
 * looked up once and the flyover works offline the next time.
 */

const CACHE_KEY = 'blacktop_place_names';
const CACHE_MAX = 300;

type Cache = Record<string, string>;
let cache: Cache | null = null;

function readCache(): Cache {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

function writeCache(key: string, name: string) {
  const c = readCache();
  c[key] = name;
  const keys = Object.keys(c);
  if (keys.length > CACHE_MAX) for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete c[k];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* kept for this launch */
  }
}

/** About a kilometre: close enough to share a town name. */
const cellOf = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

interface ReverseAnswer {
  address?: Record<string, string | undefined>;
}

/**
 * The town a point is in: the city, else the town, village or suburb, else
 * the county. Null when it can't be found (offline, the sea).
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const key = cellOf(lat, lng);
  const known = readCache()[key];
  if (known) return known;
  try {
    const { data, error } = await supabase.functions.invoke('place-search', { body: { kind: 'reverse', lat, lon: lng, zoom: 12 } });
    if (error) return null;
    const a = (data as ReverseAnswer)?.address ?? {};
    const name = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet || a.county || a.state_district || null;
    if (name) writeCache(key, name);
    return name;
  } catch {
    return null;
  }
}

/** Updates one stored ride in place and tells every screen showing the rides. */
export function patchStoredRide(id: string, patch: Partial<RideSession>, only?: (ride: RideSession) => boolean) {
  try {
    const rides = JSON.parse(localStorage.getItem(RIDES_KEY) || '[]') as RideSession[];
    let changed = false;
    const next = rides.map((r) => {
      if (r.id !== id || (only && !only(r))) return r;
      changed = true;
      return { ...r, ...patch };
    });
    if (!changed) return;
    localStorage.setItem(RIDES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('bt-local-storage-change', { detail: { key: RIDES_KEY } }));
  } catch {
    /* storage full: the ride keeps its date */
  }
}

/** Where a planned route went, when the ride had one. */
export interface RideTarget {
  name: string;
}

const LOOP = /^(loop|loop finish|loop point)/i;

/** "Brighton Marina, Brighton" → "Brighton Marina". */
const shortPlace = (name: string) => name.split(',')[0].trim();

function timeOfDayName(startedAt: string, place: string, car: boolean): string {
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h < 12) return car ? tr("Morning drive around {0}", [place]) : tr("Morning ride around {0}", [place]);
  if (h >= 12 && h < 17) return car ? tr("Afternoon drive around {0}", [place]) : tr("Afternoon ride around {0}", [place]);
  if (h >= 17 && h < 22) return car ? tr("Evening drive around {0}", [place]) : tr("Evening ride around {0}", [place]);
  return car ? tr("Night drive around {0}", [place]) : tr("Night ride around {0}", [place]);
}

/**
 * A name for a ride that's just ended:
 * - a route to somewhere: "To Brighton Marina"; a loop: "Loop from Lewes";
 * - no route, ending in another town: "Brighton to Lewes";
 * - no route, back where it started: "Evening ride around Brighton" (drive, for a car).
 * Null when no place could be found; the ride then keeps its date.
 */
export async function nameForRide(points: GpsPoint[], startedAt: string, target: RideTarget | null): Promise<string | null> {
  const first = points[0];
  const last = points[points.length - 1];
  if (target && !LOOP.test(target.name)) return tr("To {0}", [shortPlace(target.name)]);
  if (!first || !last) return null;
  const from = await placeName(first.lat, first.lng);
  if (target) return from ? tr("Loop from {0}", [from]) : null;
  const to = await placeName(last.lat, last.lng);
  if (from && to && from !== to) return tr("{0} to {1}", [from, to]);
  const here = from ?? to;
  if (!here) return null;
  return timeOfDayName(startedAt, here, getExperience().vehicles[0] === 'car');
}

/** Names a saved ride in the background, unless the rider has named it by then. */
export async function autoNameRide(rideId: string, target: RideTarget | null) {
  if (isDemoModeActive()) return;
  let ride: RideSession | undefined;
  try {
    ride = (JSON.parse(localStorage.getItem(RIDES_KEY) || '[]') as RideSession[]).find((r) => r.id === rideId);
  } catch {
    return;
  }
  if (!ride || ride.name) return;
  const name = await nameForRide(ride.gpsPoints ?? [], ride.startedAt, target);
  if (name) patchStoredRide(rideId, { name, autoNamed: true }, (r) => !r.name || !!r.autoNamed);
}

/** A place along a ride and the ride time (seconds) it's reached. */
export interface RidePlace {
  at: number;
  name: string;
}

/** How far apart (metres) the flyover looks up where the rider is. */
const PLACE_STEP_M = 2000;
const PLACE_MAX = 24;

function metres(a: GpsPoint, b: GpsPoint) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * The towns a ride passes through, for the flyover's corner: a point every
 * couple of kilometres (two dozen at most, spread over a long ride), each
 * named, keeping only the moments the name changes. `onPlace` hears each one
 * as it comes in, so the corner fills while the flyover plays. Saved on the
 * ride, so it's looked up only once.
 */
export async function placesAlongRide(ride: RideSession, onPlace?: (places: RidePlace[]) => void): Promise<RidePlace[]> {
  if (ride.places?.length) return ride.places;
  const pts = ride.gpsPoints;
  if (pts.length < 2) return [];
  const total = pts.reduce((sum, p, i) => (i ? sum + metres(pts[i - 1], p) : 0), 0);
  const step = Math.max(PLACE_STEP_M, total / PLACE_MAX);
  const start = Date.parse(ride.startedAt) || pts[0].timestamp;
  const samples: GpsPoint[] = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += metres(pts[i - 1], pts[i]);
    if (run >= step) {
      samples.push(pts[i]);
      run = 0;
    }
  }
  const places: RidePlace[] = [];
  for (const p of samples) {
    const name = await placeName(p.lat, p.lng);
    if (!name || places[places.length - 1]?.name === name) continue;
    places.push({ at: Math.max(0, (p.timestamp - start) / 1000), name });
    onPlace?.([...places]);
  }
  if (places.length && !isDemoModeActive()) patchStoredRide(ride.id, { places });
  return places;
}

/** The place the ride was in at `elapsed` seconds. */
export function placeAt(places: RidePlace[], elapsed: number): string | null {
  let name: string | null = null;
  for (const p of places) {
    if (p.at > elapsed) break;
    name = p.name;
  }
  return name ?? places[0]?.name ?? null;
}

/** A saved ride by id, from the phone's ride list. */
export function storedRide(id: string): RideSession | undefined {
  try {
    return (JSON.parse(localStorage.getItem(RIDES_KEY) || '[]') as RideSession[]).find((r) => r.id === id);
  } catch {
    return undefined;
  }
}
