import type { Map as MapLibreMap } from 'maplibre-gl';
import { noteSearchCredit } from '@/lib/searchCredit';
import { isDemoModeActive, DEMO_RECENT_LOCATIONS } from '@/lib/demoMode';
import { supabase } from '@/integrations/supabase/client';
import { tr } from '@/lib/i18n';
import { what3wordsResults } from '@/lib/what3words';
import { priceInfo, type PriceInfo } from '@/lib/priceLevel';

export interface MapSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance?: number;
  /** OpenStreetMap's `opening_hours`, as mapped (read with lib/openingHours). */
  hours?: string;
  /** How dear it is next to its kind, where there's something to go on (lib/priceLevel). */
  price?: PriceInfo | null;
}

// Visible map viewport, used as a *soft* proximity bias for free-text search
// (never a hard bounding-box lock - out-of-region results still come back,
// just ranked behind whatever's in view).
export interface MapViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface NominatimPlace {
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
}

interface OverpassElement {
  id: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

const RECENT_LOCATIONS_KEY = 'blacktop_maps_recent_locations';
const MAX_RECENT_LOCATIONS = 4;
const MAX_NEARBY_DISTANCE_KM = 30;

const categoryToNominatimQuery: Record<string, string> = {
  fuel: 'petrol station',
  'restaurant|fast_food|cafe': 'restaurant',
  'restaurant|fast_food': 'restaurant',
  cafe: 'cafe',
  'supermarket|convenience': 'supermarket',
  '24h': '24 hour store',
  drinking_water: 'drinking water',
  charging_station: 'charging station',
  'motorcycle_parking|parking': 'motorcycle parking',
  parking: 'car park',
  bicycle_parking: 'bicycle parking',
  'motorcycle|tyres': 'motorcycle shop',
  'car_repair|tyres': 'garage',
  bicycle_repair_station: 'bicycle repair',
  'pharmacy|hospital': 'pharmacy',
};

export function getRecentLocations(): MapSearchResult[] {
  if (isDemoModeActive()) return DEMO_RECENT_LOCATIONS;
  try {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/** Drops one suggestion from the recent list (the map's "visited recently" pins follow). */
export function removeRecentLocation(id: string) {
  try {
    const updated = getRecentLocations().filter((l) => l.id !== id);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('blacktop-recent-saved'));
  } catch {
    // Ignore storage errors
  }
}

export function saveRecentLocation(location: MapSearchResult) {
  try {
    const recent = getRecentLocations();
    const filtered = recent.filter((l) => l.id !== location.id);
    const updated = [location, ...filtered].slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
    // The map's "visited recently" pins refresh on this.
    window.dispatchEvent(new CustomEvent('blacktop-recent-saved'));
  } catch {
    // Ignore storage errors
  }
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function callPlaceSearch<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('place-search', { body: payload });
  if (error) throw error;
  noteSearchCredit(data);
  return data as T;
}

export async function getCountryCode(lat: number, lng: number): Promise<string | null> {
  try {
    const data = await callPlaceSearch<{ address?: { country_code?: string } }>({
      kind: 'reverse',
      lat,
      lon: lng,
      zoom: 3,
    });
    return data.address?.country_code?.toUpperCase() || null;
  } catch {
    return null;
  }
}

/** Lower-case letters and digits only: "McDonald's" and "mcdonalds" compare equal. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Places on the map right now whose name matches, straight from the basemap
 * tiles already on the phone (the OpenMapTiles `poi` layer that also draws the
 * pins). Instant, works offline, and doesn't depend on the online search
 * services, which rate-limit and sometimes return nothing for "McDonald's",
 * "Costa" and the like. Only covers the loaded area (roughly the screen).
 */
export function searchLoadedPlaces(
  map: MapLibreMap | null,
  query: string,
  anchor: { lat: number; lng: number } | null,
  limit = 12,
): MapSearchResult[] {
  const q = normaliseName(query);
  if (!map || q.length < 2) return [];
  let features: ReturnType<MapLibreMap['querySourceFeatures']> = [];
  try {
    if (!map.getSource('openmaptiles')) return [];
    features = map.querySourceFeatures('openmaptiles', { sourceLayer: 'poi' });
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: MapSearchResult[] = [];
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue;
    const p = f.properties ?? {};
    const name = String(p['name:latin'] ?? p.name ?? '');
    if (!name || !normaliseName(name).includes(q)) continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    // The same place turns up once per tile it touches.
    const key = `${normaliseName(name)}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = String(p.subclass ?? p.class ?? '').replace(/_/g, ' ');
    out.push({
      id: `tile:${key}`,
      name,
      address: kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Place',
      lat,
      lng,
      distance: anchor ? calculateDistance(anchor.lat, anchor.lng, lat, lng) : undefined,
    });
  }
  if (anchor) out.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return out.slice(0, limit);
}

export async function searchPlaces(
  query: string,
  bias: MapViewBounds | null,
  userLocation: { lat: number; lng: number } | null,
  countryCode: string | null,
): Promise<MapSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Anchor on the rider, else the middle of the map they're looking at.
  const anchor = userLocation
    ?? (bias ? { lat: (bias.north + bias.south) / 2, lng: (bias.east + bias.west) / 2 } : null);

  const NEAR_DEG = 0.45; // ~50km box
  const nearbyViewbox = anchor
    ? `${anchor.lng - NEAR_DEG},${anchor.lat + NEAR_DEG},${anchor.lng + NEAR_DEG},${anchor.lat - NEAR_DEG}`
    : null;
  const mapViewbox = bias ? `${bias.west},${bias.north},${bias.east},${bias.south}` : null;

  // A what3words address: its suggestions (none without a what3words key, and
  // then the text is searched like any other).
  const w3w = await what3wordsResults(q, anchor);
  if (w3w.length) return w3w;

  const toResult = (id: string, name: string, address: string, lat: number, lng: number): MapSearchResult => ({
    id, name, address, lat, lng,
    distance: anchor ? calculateDistance(anchor.lat, anchor.lng, lat, lng) : undefined,
  });
  const fromNominatim = (list: NominatimPlace[] | null) => (list || []).map((p) =>
    toResult(p.place_id.toString(), p.name || String(p.display_name || '').split(',')[0], p.display_name, parseFloat(p.lat), parseFloat(p.lon)));

  try {
    // Three asks at once: names and brands near the rider (OSM directly: "Tesco", "Costa"), the
    // search service inside ~50 km, and the search service anywhere (biased to the rider), so a
    // place further away (Blackpool Tower) still comes back when something nearby half matches.
    // Overpass is often down: it gets four seconds, not the half a minute it takes to fail.
    const within = <T,>(p: Promise<T>, ms: number, fallback: T) =>
      Promise.race([p.catch(() => fallback), new Promise<T>((r) => window.setTimeout(() => r(fallback), ms))]);
    const [local, bounded, wide] = await Promise.all([
      anchor
        ? within(callPlaceSearch<OverpassElement[]>({ kind: 'overpass', lat: anchor.lat, lon: anchor.lng, radius_m: 20000, amenities: [], name: q, limit: 60 }), 4000, [] as OverpassElement[])
        : Promise.resolve([] as OverpassElement[]),
      nearbyViewbox
        ? callPlaceSearch<NominatimPlace[]>({ kind: 'search', q, countryCode, viewbox: nearbyViewbox, bounded: '1', limit: 20 })
            .catch(() => [] as NominatimPlace[])
        : Promise.resolve([] as NominatimPlace[]),
      callPlaceSearch<NominatimPlace[]>({ kind: 'search', q, countryCode, viewbox: nearbyViewbox ?? mapViewbox, bounded: '0', limit: 10 })
        .catch(() => [] as NominatimPlace[]),
    ]);

    const localResults = (local || [])
      .filter((el) => !!(el.tags?.name || el.tags?.brand))
      .map((el) => {
        const name = el.tags?.name || el.tags?.brand || '';
        const address = [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(', ') || name;
        return toResult(`op:${el.id}`, name, address, el.lat, el.lon);
      });

    const results = [...localResults, ...fromNominatim(bounded), ...fromNominatim(wide)];

    // Drop near-duplicates (same name within ~100m).
    const seen: MapSearchResult[] = [];
    for (const r of results) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
      const dup = seen.some((s) => s.name.toLowerCase() === r.name.toLowerCase()
        && calculateDistance(s.lat, s.lng, r.lat, r.lng) < 0.1);
      if (!dup) seen.push(r);
    }
    // How well the name matches comes first (the place asked for by name, wherever it is), then
    // how near: sorted by distance alone, a nearby half match buried the one asked for.
    const want = normaliseName(q);
    const words = q.split(/\s+/).map(normaliseName).filter(Boolean);
    const match = (r: MapSearchResult) => {
      const n = normaliseName(r.name);
      if (n === want) return 0;
      if (n.startsWith(want)) return 1;
      if (words.every((w) => n.includes(w))) return 2;
      return 3;
    };
    seen.sort((a, b) => match(a) - match(b) || (a.distance ?? 0) - (b.distance ?? 0));
    return seen.slice(0, 8);
  } catch (error) {
    console.error('Map place search failed:', error);
    return [];
  }
}

export interface PlaceDetails {
  hours?: string;
  price: PriceInfo | null;
  /** Its map id, for station prices. */
  stationId?: string;
}
const details = new Map<string, PlaceDetails | null>();

/**
 * Opening hours and price for a place tapped on the basemap, whose tiles carry
 * neither: one look round it for its kind (`osm`, the tile's subclass, e.g.
 * "cafe"), matched by name, else the nearest within 60 m. Asked once a place
 * (remembered for the session), and only when a pin is opened.
 */
export async function placeDetails(name: string, lat: number, lng: number, osm: string | undefined): Promise<PlaceDetails | null> {
  if (!osm || !/^[a-z_]+$/.test(osm)) return null;
  const key = `${osm}:${name.toLowerCase()}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (details.has(key)) return details.get(key)!;
  let found: PlaceDetails | null = null;
  try {
    const els = await callPlaceSearch<OverpassElement[]>({ kind: 'overpass', lat, lon: lng, radius_m: 1000, amenities: [osm], limit: 60 });
    const near = (els || [])
      .map((el) => ({ el, km: calculateDistance(lat, lng, el.lat, el.lon) }))
      .filter(({ km }) => km < 0.25)
      .sort((a, b) => a.km - b.km);
    const lower = name.toLowerCase();
    const hit = near.find(({ el }) => [el.tags?.name, el.tags?.brand].some((n) => n && n.toLowerCase() === lower)) ?? near.find(({ km }) => km < 0.06);
    if (hit) found = { hours: hit.el.tags?.opening_hours, price: priceInfo(hit.el.tags), stationId: `op:${hit.el.id}` };
  } catch {
    return null; // not remembered: a failed look can be tried again
  }
  details.set(key, found);
  return found;
}

/**
 * Places of one kind near the rider, nearest first: Overpass through the
 * place-search function, the search service as a fallback. `unnamed` names the
 * places mapped without one (most car parks, toilets and taps; left out
 * otherwise), and `max` is how many come back (the map shows them all as pins).
 */
export async function searchNearbyPOIs(
  amenityQuery: string,
  userLocation: { lat: number; lng: number },
  countryCode: string | null,
  opts: { unnamed?: string; max?: number } = {},
): Promise<MapSearchResult[]> {
  const max = opts.max ?? 8;
  const is24hSearch = amenityQuery === '24h';
  const amenities = is24hSearch ? [] : amenityQuery.split('|').filter(Boolean);

  try {
    const overpass = await callPlaceSearch<OverpassElement[]>({
      kind: 'overpass',
      lat: userLocation.lat,
      lon: userLocation.lng,
      radius_m: 15000,
      amenities,
      filter24h: is24hSearch,
      limit: 80,
    });

    let results: MapSearchResult[] = (overpass || [])
      .filter((el) => !!(el.tags?.name || el.tags?.brand || el.tags?.operator || opts.unnamed))
      .map((el) => {
        const distance = calculateDistance(userLocation.lat, userLocation.lng, el.lat, el.lon);
        const name = el.tags?.name || el.tags?.brand || el.tags?.operator || opts.unnamed || '';
        const address =
          [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(', ') ||
          name;
        return { id: `op:${el.id}`, name, address, lat: el.lat, lng: el.lon, distance, hours: el.tags?.opening_hours, price: priceInfo(el.tags) };
      });

    results = results
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .filter((r) => (r.distance || 0) <= MAX_NEARBY_DISTANCE_KM)
      .slice(0, max);

    if (results.length > 0) return results;
  } catch {
    // fall through to Nominatim
  }

  const searchTerm = categoryToNominatimQuery[amenityQuery] || amenities[0] || amenityQuery;
  const delta = 0.27;
  const viewbox = `${userLocation.lng - delta},${userLocation.lat + delta},${userLocation.lng + delta},${userLocation.lat - delta}`;

  try {
    const data = await callPlaceSearch<NominatimPlace[]>({ kind: 'search', q: searchTerm, countryCode, viewbox, bounded: '1', limit: 25 });

    let results: MapSearchResult[] = (data || []).map((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
      return {
        id: place.place_id.toString(),
        name: place.name || String(place.display_name || '').split(',')[0],
        address: place.display_name,
        lat,
        lng,
        distance,
      };
    });

    results = results
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .filter((r) => (r.distance || 0) <= MAX_NEARBY_DISTANCE_KM)
      .slice(0, max);

    return results;
  } catch (error) {
    console.error('Map nearby POI search failed:', error);
    return [];
  }
}
