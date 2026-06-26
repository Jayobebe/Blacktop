import type { MapSearchResult } from './placeSearch';

export interface SavedPOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
}

const STORAGE_KEY = 'blacktop_saved_pois';
const MAX_POIS = 50;

export function getSavedPOIs(): SavedPOI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPOI[]) : [];
  } catch {
    return [];
  }
}

export function savePOI(poi: Omit<SavedPOI, 'id' | 'createdAt'>): SavedPOI {
  const existing = getSavedPOIs();
  const entry: SavedPOI = {
    ...poi,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...existing].slice(0, MAX_POIS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  // Notify any open MapSearchBar instances so the dropdown refreshes without
  // a page reload.
  window.dispatchEvent(new CustomEvent('blacktop-poi-saved'));
  return entry;
}

export function deletePOI(id: string): void {
  const existing = getSavedPOIs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter(p => p.id !== id)));
  window.dispatchEvent(new CustomEvent('blacktop-poi-saved'));
}

// Convert a SavedPOI to the MapSearchResult shape so it slots into the
// existing search dropdown without any extra type gymnastics.
export function poiToSearchResult(poi: SavedPOI): MapSearchResult {
  return {
    id: `poi:${poi.id}`,
    name: poi.name,
    address: 'Saved location',
    lat: poi.lat,
    lng: poi.lng,
  };
}
