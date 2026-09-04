import { supabase } from '@/integrations/supabase/client';

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
  { id: 'gas', label: 'Gas', query: 'fuel' },
  { id: 'food', label: 'Food', query: 'restaurant|fast_food|cafe' },
  { id: 'store', label: 'Store', query: 'supermarket|convenience' },
  { id: 'cards', label: 'Cards', query: 'cards' },
];

const RECENT_LOCATIONS_KEY = 'blacktop_maps_recent_locations';
const MAX_RECENT_LOCATIONS = 4;
const MAX_NEARBY_DISTANCE_KM = 30;

const categoryToNominatimQuery: Record<string, string> = {
  fuel: 'petrol station',
  'restaurant|fast_food|cafe': 'restaurant',
  'supermarket|convenience': 'supermarket',
  '24h': '24 hour store',
};

export function getRecentLocations(): MapSearchResult[] {
  try {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveRecentLocation(location: MapSearchResult) {
  try {
    const recent = getRecentLocations();
    const filtered = recent.filter((l) => l.id !== location.id);
    const updated = [location, ...filtered].slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
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

export async function searchPlaces(
  query: string,
  bias: MapViewBounds | null,
  userLocation: { lat: number; lng: number } | null,
  countryCode: string | null,
): Promise<MapSearchResult[]> {
  if (!query.trim()) return [];

  // Build a soft proximity bias centered on the rider (~50km box). This
  // tells Nominatim to rank nearby matches higher without hard-excluding
  // legitimate long-distance destinations.
  const NEAR_DEG = 0.45; // ~50km lat; ~50km lng at mid-latitudes
  const nearbyViewbox = userLocation
    ? `${userLocation.lng - NEAR_DEG},${userLocation.lat + NEAR_DEG},${userLocation.lng + NEAR_DEG},${userLocation.lat - NEAR_DEG}`
    : null;
  const mapViewbox = bias ? `${bias.west},${bias.north},${bias.east},${bias.south}` : null;

  try {
    // 1) Hard-bounded to a tight nearby box first so local hits dominate.
    let results0: NominatimPlace[] = [];
    if (nearbyViewbox) {
      results0 = await callPlaceSearch<NominatimPlace[]>({
        kind: 'search',
        q: query,
        countryCode,
        viewbox: nearbyViewbox,
        bounded: '1',
        limit: 25,
      });
    }

    // 2) If nothing nearby, retry softly biased (not bounded) so wider
    //    results surface but still ranked toward the rider's area.
    if (!results0 || results0.length === 0) {
      results0 = await callPlaceSearch<NominatimPlace[]>({
        kind: 'search',
        q: query,
        countryCode,
        viewbox: nearbyViewbox ?? mapViewbox,
        bounded: '0',
        limit: 30,
      });
    }

    let results: MapSearchResult[] = (results0 || []).map((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const result: MapSearchResult = {
        id: place.place_id.toString(),
        name: place.name || String(place.display_name || '').split(',')[0],
        address: place.display_name,
        lat,
        lng,
      };
      if (userLocation) {
        result.distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
      }
      return result;
    });

    // Rank closer-to-rider results first, but never drop far-away matches —
    // genuine long-distance destinations still need to surface.
    if (userLocation) {
      results = results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    return results.slice(0, 8);
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
      radius_m: 30000,
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
