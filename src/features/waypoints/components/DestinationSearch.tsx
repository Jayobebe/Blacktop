import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, MapPin, Plus, X, LocateFixed, Clock, Building2, Bookmark, IdCard, Route as RouteIcon, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useShortLandscape } from '@/hooks/useShortLandscape';
import { useStripNudge } from '@/hooks/useStripNudge';
import { ConvoyDestination } from '@/types/convoy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getSavedPOIs, type SavedPOI } from '@/features/map';
import { useSavedRoutes, deleteSavedRoute, type SavedRoute } from '@/features/map/lib/savedRoutes';
import { kmText } from '@/lib/units';
import { useSettings } from '@/features/settings';
import { useCardDrops } from '@/features/cards';
import { useExperience, placeCategories, REFUEL_NOMINATIM } from '@/features/experience';

import { tr } from '@/lib/i18n';
import { resolveWhat3WordsResult, what3wordsResults } from '@/lib/what3words';
import { QuickChipRow } from '@/components/QuickChipRow';
import { PixelLoader } from '@/components/PixelLoader';

interface SearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance?: number;
  type?: string;
}

interface DestinationSearchProps {
  destination: ConvoyDestination | null;
  onSetDestination: (destination: ConvoyDestination) => void;
  onClearDestination: () => void;
  onAddStop?: () => void;
  isLeader: boolean;
  userLocation?: UserLocation | null;
  countryCode?: string | null;
  distanceUnit?: 'miles' | 'km';
  /** A saved route picked (Blacktop Console → Plan a route): the lobby loads its stops and end. */
  onRoute?: (route: SavedRoute) => void;
}

interface UserLocation {
  lat: number;
  lng: number;
}

/** A quick search: the map's own (experience/lib/places), so both look alike; card drops are Blacktop World's. */
interface QuickCategory {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Its colour; none for card drops, which take the accent. */
  color: string;
  query: string;
  unnamed?: string;
}

const RECENT_LOCATIONS_KEY = 'blacktop_recent_locations';
const MAX_RECENT_LOCATIONS = 4;

// Card drops are a Blacktop World feature — the category only appears when
// the rider has opted in.
const CARDS_CATEGORY: QuickCategory = {
  id: 'cards',
  label: tr("Cards"),
  Icon: IdCard,
  color: '',
  query: 'cards',
};



function getRecentLocations(): SearchResult[] {
  try {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentLocation(location: SearchResult) {
  try {
    const recent = getRecentLocations();
    const filtered = recent.filter(l => l.id !== location.id);
    const updated = [location, ...filtered].slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type PlaceSearchReverseResponse = { address?: { country_code?: string } };

async function callPlaceSearch<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('place-search', {
    body: payload,
  });
  if (error) throw error;
  return data as T;
}

async function getCountryCode(lat: number, lng: number): Promise<string | null> {
  try {
    const data = await callPlaceSearch<PlaceSearchReverseResponse>({
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

// Max distance in km for category searches (nearby places)
const MAX_NEARBY_DISTANCE_KM = 30;

// OSM amenity to Nominatim search term mapping for better results
const categoryToNominatimQuery: Record<string, string> = {
  'fuel': 'petrol station',
  'restaurant|fast_food|cafe': 'restaurant',
  'restaurant|fast_food': 'restaurant',
  cafe: 'cafe',
  'supermarket|convenience': 'supermarket',
  '24h': '24 hour store',
  'motorcycle_parking|parking': 'motorcycle parking',
  parking: 'car park',
  bicycle_parking: 'bicycle parking',
  'motorcycle|tyres': 'motorcycle shop',
  'car_repair|tyres': 'garage',
  bicycle_repair_station: 'bicycle repair',
  'pharmacy|hospital': 'pharmacy',
  ...REFUEL_NOMINATIM,
};

// Search nearby POIs (categories) using Overpass first (best for amenities),
// then fall back to Nominatim bounded search.
async function searchNearbyPOIs(
  amenityQuery: string,
  userLocation: UserLocation,
  countryCode: string | null,
  /** Name for places mapped without one (car parks, toilets, taps), which are otherwise left out. */
  unnamed?: string,
): Promise<SearchResult[]> {
  const is24hSearch = amenityQuery === '24h';
  const amenities = is24hSearch ? [] : amenityQuery.split('|').filter(Boolean);

  // 1) Overpass: best chance to find actual cafes/fuel/etc near you
  try {
    const overpass = await callPlaceSearch<Array<{ id: string; lat: number; lon: number; tags: Record<string, any> }>>({
      kind: 'overpass',
      lat: userLocation.lat,
      lon: userLocation.lng,
      radius_m: 30000,
      amenities,
      filter24h: is24hSearch,
      limit: 80,
    });

    let results: SearchResult[] = (overpass || [])
      .filter((el) => !!(el.tags?.name || el.tags?.brand || el.tags?.operator || unnamed))
      .map((el) => {
        const distance = calculateDistance(userLocation.lat, userLocation.lng, el.lat, el.lon);
        const name = el.tags?.name || el.tags?.brand || el.tags?.operator || unnamed || '';
        const address = [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']]
          .filter(Boolean)
          .join(', ') || String(el.tags?.['addr:full'] || '');

        return {
          id: `op:${el.id}`,
          name,
          address: address || name,
          lat: el.lat,
          lng: el.lon,
          type: el.tags?.amenity,
          distance,
        };
      });

    results = results
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .filter((r) => (r.distance || 0) <= MAX_NEARBY_DISTANCE_KM)
      .slice(0, 8);

    if (results.length > 0) return results;
  } catch {
    // ignore and fallback
  }

  // 2) Nominatim bounded fallback
  const searchTerm = categoryToNominatimQuery[amenityQuery] || amenities[0] || amenityQuery;
  const delta = 0.27; // ~30km
  const viewbox = `${userLocation.lng - delta},${userLocation.lat + delta},${userLocation.lng + delta},${userLocation.lat - delta}`;

  try {
    const data = await callPlaceSearch<any[]>({
      kind: 'search',
      q: searchTerm,
      countryCode,
      viewbox,
      bounded: '1',
      limit: 25,
    });

    let results: SearchResult[] = (data || []).map((place: any) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);

      return {
        id: place.place_id.toString(),
        name: place.name || String(place.display_name || '').split(',')[0],
        address: place.display_name,
        lat,
        lng,
        type: place.type,
        distance,
      };
    });

    results = results
      .sort((a, b) => (a.distance || 0) - (b.distance || 0))
      .filter((r) => (r.distance || 0) <= MAX_NEARBY_DISTANCE_KM)
      .slice(0, 8);

    return results;
  } catch (error) {
    console.error('Nearby POI search failed:', error);
    return [];
  }
}

function containsPostalCode(query: string, countryCode: string | null): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return false;

  // UK postcode (e.g., "PR8 5PH", "SW1A 1AA")
  const uk = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
  // US ZIP (e.g., "90210" or "90210-1234")
  const us = /\b\d{5}(?:-\d{4})?\b/;
  // Canada (e.g., "M5V 2T6")
  const ca = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;

  // If we know the country, we can bias the check, but any match counts.
  if (countryCode === 'GB') return uk.test(q);
  if (countryCode === 'US') return us.test(q);
  if (countryCode === 'CA') return ca.test(q);

  return uk.test(q) || us.test(q) || ca.test(q);
}

// Nominatim for general text search (nearby-first; if no nearby results, expand)
async function searchPlaces(
  query: string,
  userLocation: UserLocation | null,
  countryCode: string | null
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // A what3words address: its suggestions (none without a what3words key, and
  // then the text is searched like any other).
  const w3w = await what3wordsResults(query, userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null);
  if (w3w.length) return w3w;

  const isPostal = containsPostalCode(query, countryCode);
  const preferNearby = !!userLocation && !isPostal;

  const nearViewbox = userLocation
    ? `${userLocation.lng - 0.27},${userLocation.lat + 0.27},${userLocation.lng + 0.27},${userLocation.lat - 0.27}`
    : null;

  try {
    // Nearby (strict bounds, for non-postal searches) and anywhere, at once: nearby-first alone
    // never looked further when something near half matched, so "Blackpool Tower" from elsewhere
    // came back as nothing to do with it.
    const [nearby, anywhere] = await Promise.all([
      preferNearby
        ? callPlaceSearch<any[]>({ kind: 'search', q: query, countryCode, viewbox: nearViewbox, bounded: '1', limit: 25 }).catch(() => [])
        : Promise.resolve([] as any[]),
      callPlaceSearch<any[]>({ kind: 'search', q: query, countryCode, viewbox: preferNearby ? nearViewbox : null, bounded: '0', limit: preferNearby ? 15 : 30 }),
    ]);
    const seenIds = new Set<string>();
    const places = [...(nearby || []), ...(anywhere || [])].filter((p: any) => {
      const id = String(p?.place_id ?? '');
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    let results: SearchResult[] = places.map((place: any) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);

      const result: SearchResult = {
        id: place.place_id.toString(),
        name: place.name || String(place.display_name || '').split(',')[0],
        address: place.display_name,
        lat,
        lng,
        type: place.type,
      };

      if (userLocation) {
        result.distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
      }

      return result;
    });

    // The place asked for by name first, wherever it is; then the nearest. A loose match more than
    // 30 km off is only kept when nothing nearer matched at all.
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
    const want = norm(query);
    const words = query.split(/\s+/).map(norm).filter(Boolean);
    const match = (r: SearchResult) => {
      const n = norm(r.name);
      if (n === want) return 0;
      if (n.startsWith(want)) return 1;
      if (words.every((w) => n.includes(w))) return 2;
      return 3;
    };
    if (userLocation && preferNearby && results.some((r) => match(r) < 3 || (r.distance || 0) <= 30)) {
      results = results.filter((r) => match(r) < 3 || (r.distance || 0) <= 30);
    }
    results.sort((a, b) => match(a) - match(b) || (a.distance || 0) - (b.distance || 0));

    return results.slice(0, 8);
  } catch (error) {
    console.error('Place search failed:', error);
    return [];
  }
}

export function DestinationSearch({
  destination,
  onSetDestination,
  onClearDestination,
  onAddStop,
  isLeader,
  userLocation: externalUserLocation,
  countryCode: externalCountryCode,
  distanceUnit = 'km',
  onRoute,
}: DestinationSearchProps) {
  const [query, setQuery] = useState('');
  const savedRoutes = useSavedRoutes();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [internalUserLocation, setInternalUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [internalCountryCode, setInternalCountryCode] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<SearchResult[]>([]);
  const [savedPOIs, setSavedPOIs] = useState<SavedPOI[]>(() => getSavedPOIs());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { settings } = useSettings();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchIdRef = useRef<number>(0); // Track latest search to prevent race conditions
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number; rowTop: number; right: number } | null>(null);
  const shortLandscape = useShortLandscape();

  // Use external location if provided, otherwise use internal
  const userLocation = externalUserLocation ?? internalUserLocation;
  const countryCode = externalCountryCode ?? internalCountryCode;

  // Nearby card drops — only ever fetched when Blacktop World is opted into.
  const cardsEnabled = settings.blacktopWorldEnabled && settings.collectiblesEnabled;
  const { drops: cardDrops } = useCardDrops(cardsEnabled ? userLocation ?? null : null);
  const { vehicles } = useExperience();
  const quickCategories: QuickCategory[] = placeCategories(vehicles);
  const categories = cardsEnabled ? [...quickCategories, CARDS_CATEGORY] : quickCategories;


  useEffect(() => {
    setRecentLocations(getRecentLocations());
  }, []);

  useEffect(() => {
    const refresh = () => setSavedPOIs(getSavedPOIs());
    window.addEventListener('blacktop-poi-saved', refresh);
    return () => window.removeEventListener('blacktop-poi-saved', refresh);
  }, []);

  // Only fetch location internally if not provided externally
  useEffect(() => {
    if (externalUserLocation) return; // Skip if location is provided externally
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setInternalUserLocation(loc);
          const code = await getCountryCode(loc.lat, loc.lng);
          if (code) setInternalCountryCode(code);
        },
        (error) => {
          console.warn('Could not get location:', error.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, [externalUserLocation]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setShowResults(false);
        setActiveCategory(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocate = () => {
    if (!('geolocation' in navigator)) {
      toast.error(tr("Location not supported"));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setInternalUserLocation(loc);
        const code = await getCountryCode(loc.lat, loc.lng);
        if (code) setInternalCountryCode(code);
        toast.success(tr("Location updated"));
        setIsLocating(false);
      },
      () => {
        toast.error(tr("Could not get location"));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const performSearch = useCallback(async (searchQuery: string, currentSearchId: number) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const searchResults = await searchPlaces(searchQuery, userLocation, countryCode);

      // Prepend matching saved POIs so personal spots surface before remote results.
      const q = searchQuery.toLowerCase();
      const matchingPOIs: SearchResult[] = savedPOIs
        .filter(p => p.name.toLowerCase().includes(q))
        .map(p => ({ id: `poi:${p.id}`, name: p.name, address: tr("Saved location"), lat: p.lat, lng: p.lng }));
      const poiIds = new Set(matchingPOIs.map(r => r.id));
      const merged = [...matchingPOIs, ...searchResults.filter(r => !poiIds.has(r.id))];

      if (searchIdRef.current === currentSearchId) {
        setResults(merged);
      }
    } catch (error) {
      console.error('Search failed:', error);
      if (searchIdRef.current === currentSearchId) {
        setResults([]);
      }
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setIsSearching(false);
      }
    }
  }, [userLocation, countryCode, savedPOIs]);

  // Keep the card list in sync once nearby drops load.
  useEffect(() => {
    if (activeCategory !== 'cards') return;
    setResults(
      cardDrops.map((d) => ({
        id: `card-${d.id}`,
        name: `${d.vehicleName}${d.collected ? ' ✓' : ''}`,
        address: tr("Card drop · {0}", [d.ownerName]),
        lat: d.lat,
        lng: d.lng,
        type: 'card',
      })),
    );
  }, [activeCategory, cardDrops]);

  // If location becomes available after the user typed or picked a category,
  // rerun the search so results appear without requiring another tap.

  useEffect(() => {
    if (!userLocation) return;

    if (activeCategory) {
      const cat = quickCategories.find(c => c.id === activeCategory);
      if (cat) {
        const currentSearchId = ++searchIdRef.current;
        setIsSearching(true);
        searchNearbyPOIs(cat.query, userLocation, countryCode, cat.unnamed).then(results => {
          if (searchIdRef.current === currentSearchId) {
            setResults(results);
            setIsSearching(false);
          }
        }).catch(() => {
          if (searchIdRef.current === currentSearchId) setIsSearching(false);
        });
      }
      return;
    }

    if (query.length < 2) return;
    if (containsPostalCode(query, countryCode)) return;

    const currentSearchId = ++searchIdRef.current;
    performSearch(query, currentSearchId);
    // quickCategories is rebuilt every render (only read to look up the active one); listing it would re-run the search each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, query, activeCategory, countryCode, performSearch]);

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    setShowResults(true);
    setActiveCategory(null);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    
    // Increment search ID to invalidate any pending searches
    const currentSearchId = ++searchIdRef.current;
    
    // Fast 150ms debounce
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery, currentSearchId);
    }, 150);
  }, [performSearch]);

  const handleCategoryClick = async (category: QuickCategory) => {
    // Card drops come from the World feed, not from Overpass.
    if (category.id === 'cards') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchIdRef.current++;
      setQuery('');
      setShowResults(true);
      setIsSearching(false);
      setActiveCategory((prev) => (prev === 'cards' ? null : 'cards'));
      setResults(
        cardDrops.map((d) => ({
          id: `card-${d.id}`,
          name: `${d.vehicleName}${d.collected ? ' ✓' : ''}`,
          address: tr("Card drop · {0}", [d.ownerName]),
          lat: d.lat,
          lng: d.lng,
          type: 'card',
        })),
      );
      return;
    }

    // Clear any pending text searches
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    setActiveCategory(category.id);
    setQuery('');
    setShowResults(true);
    setIsSearching(true);
    
    // Increment search ID to invalidate any pending searches
    const currentSearchId = ++searchIdRef.current;
    
    try {
      // No location yet — leave the spinner active so the retry effect fires
      // automatically once geolocation resolves (no toast, no empty flash).
      if (!userLocation) return;

      const searchResults = await searchNearbyPOIs(category.query, userLocation, countryCode, category.unnamed);
      if (searchIdRef.current === currentSearchId) {
        setResults(searchResults);
      }
    } catch {
      if (searchIdRef.current === currentSearchId) {
        setResults([]);
      }
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setIsSearching(false);
      }
    }
  };

  const handleFocus = () => {
    setShowResults(true);
  };

  const handleSelectResult = async (picked: SearchResult) => {
    // A what3words suggestion has no position until it's picked.
    const result = await resolveWhat3WordsResult(picked);
    if (!result) {
      toast.error(tr("Couldn't find that what3words address"));
      return;
    }
    saveRecentLocation(result);
    setRecentLocations(getRecentLocations());
    
    onSetDestination({
      name: result.name,
      address: result.address,
      lat: result.lat,
      lng: result.lng,
    });
    setQuery('');
    setResults([]);
    setShowResults(false);
    setActiveCategory(null);
  };


  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Track input position so the portal dropdown can anchor itself
  useEffect(() => {
    if (!showResults) return;
    const updateRect = () => {
      const el = inputWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownRect({ left: r.left, top: r.bottom + 8, width: r.width, rowTop: r.top, right: r.right });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [showResults, results, recentLocations, isSearching, activeCategory, shortLandscape]);

  const showIdle = query.length < 2 && !activeCategory;
  const showRecent = showIdle && recentLocations.length > 0;
  const hasSavedPOIs = showIdle && savedPOIs.length > 0;
  const isPostalSearch = query.length >= 2 && containsPostalCode(query, countryCode);
  const rawDisplayResults = showIdle ? recentLocations : results;
  const displayResults = rawDisplayResults.map((r) => {
    if (!userLocation) return r;
    if (r.distance !== undefined) return r;
    return { ...r, distance: calculateDistance(userLocation.lat, userLocation.lng, r.lat, r.lng) };
  });
  // Saved routes: all of them idle, the ones whose name matches while typing (as in the map's search).
  const routeQ = query.trim().toLowerCase();
  const routeList = !onRoute || activeCategory ? [] : routeQ.length >= 2 ? savedRoutes.filter((r) => r.name.toLowerCase().includes(routeQ)) : showIdle ? savedRoutes : [];
  const hasDisplayContent = hasSavedPOIs || routeList.length > 0 || displayResults.length > 0 || isSearching;
  const strip = shortLandscape && showResults && hasDisplayContent;
  const nudging = useStripNudge(strip);

  if (destination) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{destination.name}</p>
            <p className="text-xs text-muted-foreground truncate">{destination.address}</p>
          </div>
          {isLeader && (
            <button
              onClick={onClearDestination}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        
        {onAddStop && isLeader && (
          <Button
            onClick={onAddStop}
            variant="outline"
            className="w-full mt-3 h-10 text-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            {tr("Add Stop")}
          </Button>
        )}
      </div>
    );
  }

  if (!isLeader) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{tr("Waiting for leader to set destination...")}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative z-50 isolate space-y-3">
      {/* Quick searches: the map's own, each in its colour; as many as fit, then "+N" for the rest */}
      <QuickChipRow items={categories} active={activeCategory} onPick={handleCategoryClick} look="tile" />

      {/* Search input. On a phone on its side with suggestions up, it narrows and the
          suggestions run sideways beside it in the same row (the keyboard takes the bottom). */}
      <div ref={inputWrapRef} className={cn('flex gap-2', strip && 'w-[40%]')}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={handleFocus}
            placeholder={userLocation ? tr("Search nearby...") : tr("Search destination...")}
            className="pl-10 pr-10 bg-card border-border h-12 text-base"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <PixelLoader className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <button
          onClick={handleLocate}
          disabled={isLocating}
          className={cn(
            "p-3 rounded-xl border transition-colors h-12 w-12 flex items-center justify-center",
            userLocation 
              ? "bg-accent/10 border-accent text-accent" 
              : "bg-card border-border text-muted-foreground hover:bg-muted"
          )}
          title={tr("Use my location")}
        >
          {isLocating ? (
            <PixelLoader className="w-5 h-5" />
          ) : (
            <LocateFixed className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Results dropdown rendered in a portal so it overlays everything (chat, members, etc.) */}
      {showResults && hasDisplayContent && dropdownRect && createPortal(
        <div
          ref={dropdownRef}
          style={
            (strip
              ? { '--strip-h': '3rem', position: 'fixed', top: dropdownRect.rowTop, left: dropdownRect.right + 8, right: 'calc(0.5rem + var(--safe-right))', zIndex: 9999 }
              : { position: 'fixed', left: dropdownRect.left, top: dropdownRect.top, width: dropdownRect.width, zIndex: 9999 }) as React.CSSProperties
          }
          className={cn('suggest-list bg-card border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto animate-fade-in max-h-[60vh] overflow-y-auto', nudging && 'suggest-nudge')}
        >
          {routeList.length > 0 && (
            <>
              <div className="suggest-head px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <RouteIcon className="w-3.5 h-3.5" />
                {tr("Saved routes")}
              </div>
              {routeList.map((r) => (
                <div key={r.id} className="flex items-center border-b border-border">
                  <button
                    onClick={() => {
                      setShowResults(false);
                      setQuery('');
                      onRoute?.(r);
                    }}
                    className="flex-1 min-w-0 flex items-center gap-3 p-4 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                      <RouteIcon className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {tr("Saved route")} · {kmText(r.distanceMeters / 1000)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => void deleteSavedRoute(r.id)}
                    className="glove-hit p-2 mr-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={tr("Remove {0}", [r.name])}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}
          {/* Saved POIs — idle state only */}
          {hasSavedPOIs && (
            <>
              <div className="suggest-head px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <Bookmark className="w-3.5 h-3.5" />
                {tr("Saved places")}
              </div>
              {savedPOIs.map((poi, index) => (
                <button
                  key={poi.id}
                  onClick={() => handleSelectResult({ id: `poi:${poi.id}`, name: poi.name, address: tr("Saved location"), lat: poi.lat, lng: poi.lng })}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 text-left",
                    "hover:bg-accent/10 active:bg-accent/20 transition-colors",
                    (index !== savedPOIs.length - 1 || showRecent) && "border-b border-border"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                    <Bookmark className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{poi.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{tr("Saved location")}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Recent destinations — idle state only */}
          {showRecent && (
            <div className="suggest-head px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
              <Clock className="w-3.5 h-3.5" />
              {tr("Recent destinations")}
            </div>
          )}
          {activeCategory && !isSearching && (
            <div className="suggest-head px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
              {(() => {
                const cat = categories.find((c) => c.id === activeCategory);
                if (!cat) return null;
                return (
                  <>
                    <cat.Icon className="w-3.5 h-3.5" style={cat.color ? { color: cat.color } : undefined} />
                    <span>{tr("Nearby: {0}", [cat.label])}</span>
                  </>
                );
              })()}
            </div>
          )}
          {isSearching ? (
            <div className="p-6 text-center text-muted-foreground">
              <PixelLoader className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm">{tr("Finding places...")}</span>
            </div>
          ) : displayResults.length === 0 && !hasSavedPOIs && !routeList.length ? (
            <div className="p-6 text-center text-muted-foreground">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <span className="text-sm">
                {!userLocation && query.length >= 2 && !isPostalSearch
                  ? tr("Tap the target icon to enable nearby search.")
                  : userLocation && !isPostalSearch
                    ? tr("No nearby matches. Try a postcode to search farther.")
                    : tr("No results found")}
              </span>
            </div>
          ) : (
            displayResults.map((result, index) => {
              const isSavedPOI = result.id.startsWith('poi:');
              return (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result)}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 text-left",
                    "hover:bg-accent/10 active:bg-accent/20 transition-colors",
                    index !== displayResults.length - 1 && "border-b border-border"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    isSavedPOI ? "bg-accent/15" : showRecent ? "bg-muted" : "bg-accent/10"
                  )}>
                    {isSavedPOI ? (
                      <Bookmark className="w-5 h-5 text-accent" />
                    ) : showRecent ? (
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <MapPin className="w-5 h-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{result.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{result.address}</p>
                  </div>
                  {result.distance !== undefined && (
                    <div className="flex-shrink-0 text-right">
                      <span className="text-sm font-medium text-accent">
                        {distanceUnit === 'miles'
                          ? result.distance < 1.6
                            ? tr("{0} ft", [Math.round(result.distance * 1000 * 3.281)])
                            : tr("{0} mi", [(result.distance * 0.621371).toFixed(1)])
                          : result.distance < 1
                            ? tr("{0} m", [Math.round(result.distance * 1000)])
                            : tr("{0} km", [result.distance.toFixed(1)])
                        }
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
