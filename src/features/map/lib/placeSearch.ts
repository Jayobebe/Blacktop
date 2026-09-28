import type { Map as MapLibreMap } from 'maplibre-gl';
import { isDemoModeActive, DEMO_RECENT_LOCATIONS } from '@/lib/demoMode';
import { supabase } from '@/integrations/supabase/client';
import { tr } from '@/lib/i18n';

export interface MapSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance?: number;
}

export interface QuickCategory {
  id: string;
  label: string;
  query: string;
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

export const QUICK_CATEGORIES: QuickCategory[] = [
  { id: 'gas', label: tr("Gas"), query: 'fuel' },
  { id: 'food', label: tr("Food"), query: 'restaurant|fast_food|cafe' },
  { id: 'store', label: tr("Store"), query: 'supermarket|convenience' },
  { id: 'cards', label: tr("Cards"), query: 'cards' },
];

const RECENT_LOCATIONS_KEY = 'blacktop_maps_recent_locations';
const MAX_RECENT_LOCATIONS = 4;
const MAX_NEARBY_DISTANCE_KM = 30;

const categoryToNominatimQuery: Record<string, string> = {
  fuel: 'petrol station',
  'restaurant|fast_food|cafe': 'restaurant',
  'supermarket|convenience': 'supermarket',
  '24h': '24 hour store',
  drinking_water: 'drinking water',
  charging_station: 'charging station',
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

  const toResult = (id: string, name: string, address: string, lat: number, lng: number): MapSearchResult => ({
    id, name, address, lat, lng,
    distance: anchor ? calculateDistance(anchor.lat, anchor.lng, lat, lng) : undefined,
  });
  const fromNominatim = (list: NominatimPlace[] | null) => (list || []).map((p) =>
    toResult(p.place_id.toString(), p.name || String(p.display_name || '').split(',')[0], p.display_name, parseFloat(p.lat), parseFloat(p.lon)));

  try {
    // Nearby name/brand matches (OSM directly) + address-style matches in a
    // ~50km box, together, so local places like "Tesco" or "Costa" show up.
    const [local, bounded] = await Promise.all([
      anchor
        ? callPlaceSearch<OverpassElement[]>({ kind: 'overpass', lat: anchor.lat, lon: anchor.lng, radius_m: 20000, amenities: [], name: q, limit: 60 })
            .catch(() => [] as OverpassElement[])
        : Promise.resolve([] as OverpassElement[]),
      nearbyViewbox
        ? callPlaceSearch<NominatimPlace[]>({ kind: 'search', q, countryCode, viewbox: nearbyViewbox, bounded: '1', limit: 20 })
            .catch(() => [] as NominatimPlace[])
        : Promise.resolve([] as NominatimPlace[]),
    ]);

    const localResults = (local || [])
      .filter((el) => !!(el.tags?.name || el.tags?.brand))
      .map((el) => {
        const name = el.tags?.name || el.tags?.brand;
        const address = [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(', ') || name;
        return toResult(`op:${el.id}`, name, address, el.lat, el.lon);
      });

    let results = [...localResults, ...fromNominatim(bounded)];

    // Nothing nearby: widen out (legit long-distance destinations, towns).
    if (results.length === 0) {
      const wide = await callPlaceSearch<NominatimPlace[]>({
        kind: 'search', q, countryCode, viewbox: nearbyViewbox ?? mapViewbox, bounded: '0', limit: 20,
      });
      results = fromNominatim(wide);
    }

    // Drop near-duplicates (same name within ~100m).
    const seen: MapSearchResult[] = [];
    for (const r of results) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
      const dup = seen.some((s) => s.name.toLowerCase() === r.name.toLowerCase()
        && calculateDistance(s.lat, s.lng, r.lat, r.lng) < 0.1);
      if (!dup) seen.push(r);
    }
    if (anchor) seen.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return seen.slice(0, 8);
  } catch (error) {
    console.error('Map place search failed:', error);
    return [];
  }
}

export async function searchNearbyPOIs(
  amenityQuery: string,
  userLocation: { lat: number; lng: number },
  countryCode: string | null,
): Promise<MapSearchResult[]> {
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
      .filter((el) => !!(el.tags?.name || el.tags?.brand || el.tags?.operator))
      .map((el) => {
        const distance = calculateDistance(userLocation.lat, userLocation.lng, el.lat, el.lon);
        const name = el.tags?.name || el.tags?.brand || el.tags?.operator;
        const address =
          [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(', ') ||
          name;
        return { id: `op:${el.id}`, name, address, lat: el.lat, lng: el.lon, distance };
      });

    results = results
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .filter((r) => (r.distance || 0) <= MAX_NEARBY_DISTANCE_KM)
      .slice(0, 8);

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
      .slice(0, 8);

    return results;
  } catch (error) {
    console.error('Map nearby POI search failed:', error);
    return [];
  }
}
