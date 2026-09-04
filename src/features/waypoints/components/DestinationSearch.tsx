import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, MapPin, Plus, X, Loader2, LocateFixed, Clock, Fuel, UtensilsCrossed, ShoppingCart, Building2, Bookmark, IdCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConvoyDestination } from '@/types/convoy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getSavedPOIs, type SavedPOI } from '@/features/map';
import { useSettings } from '@/features/settings';
import { useCardDrops } from '@/features/cards';


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
}

interface UserLocation {
  lat: number;
  lng: number;
}

interface QuickCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  query: string;
}

const RECENT_LOCATIONS_KEY = 'blacktop_recent_locations';
const MAX_RECENT_LOCATIONS = 4;

// OSM amenity tags for Overpass API
const quickCategories: QuickCategory[] = [
  { id: 'gas', label: 'Gas', icon: <Fuel className="w-4 h-4" />, query: 'fuel' },
  { id: 'food', label: 'Food', icon: <UtensilsCrossed className="w-4 h-4" />, query: 'restaurant|fast_food|cafe' },
  { id: 'store', label: 'Store', icon: <ShoppingCart className="w-4 h-4" />, query: 'supermarket|convenience' },
];

// Card drops are a Blacktop World feature — the category only appears when
// the rider has opted in.
const CARDS_CATEGORY: QuickCategory = {
  id: 'cards',
  label: 'Cards',
  icon: <IdCard className="w-4 h-4" />,
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
  'supermarket|convenience': 'supermarket',
  '24h': '24 hour store',
};

// Search nearby POIs (categories) using Overpass first (best for amenities),
// then fall back to Nominatim bounded search.
async function searchNearbyPOIs(
  amenityQuery: string,
  userLocation: UserLocation,
  countryCode: string | null
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
      .filter((el) => !!(el.tags?.name || el.tags?.brand || el.tags?.operator))
      .map((el) => {
        const distance = calculateDistance(userLocation.lat, userLocation.lng, el.lat, el.lon);
        const name = el.tags?.name || el.tags?.brand || el.tags?.operator;
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

  const isPostal = containsPostalCode(query, countryCode);
  const preferNearby = !!userLocation && !isPostal;

  const nearViewbox = userLocation
    ? `${userLocation.lng - 0.27},${userLocation.lat + 0.27},${userLocation.lng + 0.27},${userLocation.lat - 0.27}`
    : null;

  try {
    // 1) Nearby-first (strict bounds) for non-postal searches
    const primary = await callPlaceSearch<any[]>({
      kind: 'search',
      q: query,
      countryCode,
      viewbox: preferNearby ? nearViewbox : null,
      bounded: preferNearby ? '1' : '0',
      limit: preferNearby ? 25 : 30,
    });

    // 2) If nothing nearby and user didn't type a postcode/ZIP, broaden to anywhere
    const usedExpanded = preferNearby && (!primary || primary.length === 0);
    const secondary = usedExpanded
      ? await callPlaceSearch<any[]>({
          kind: 'search',
          q: query,
          countryCode,
          viewbox: null,
          bounded: '0',
          limit: 30,
        })
      : primary;

    let results: SearchResult[] = (secondary || []).map((place: any) => {
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

    if (userLocation) {
      results = results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

      // Only clamp to "nearby" when we actually found nearby results.
      if (!usedExpanded) {
        results = results.filter((r) => !preferNearby || (r.distance || 0) <= 30);
      }
    }

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
}: DestinationSearchProps) {
  const [query, setQuery] = useState('');
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
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);

  // Use external location if provided, otherwise use internal
  const userLocation = externalUserLocation ?? internalUserLocation;
  const countryCode = externalCountryCode ?? internalCountryCode;

  // Nearby card drops — only ever fetched when Blacktop World is opted into.
  const cardsEnabled = settings.blacktopWorldEnabled;
  const { drops: cardDrops } = useCardDrops(cardsEnabled ? userLocation ?? null : null);
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
      toast.error('Location not supported');
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
        toast.success('Location updated');
        setIsLocating(false);
      },
      () => {
        toast.error('Could not get location');
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
        .map(p => ({ id: `poi:${p.id}`, name: p.name, address: 'Saved location', lat: p.lat, lng: p.lng }));
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

  // If location becomes available after the user typed or picked a category,
  // rerun the search so results appear without requiring another tap.
  useEffect(() => {
    if (!userLocation) return;

    if (activeCategory) {
      const cat = quickCategories.find(c => c.id === activeCategory);
      if (cat) {
        const currentSearchId = ++searchIdRef.current;
        setIsSearching(true);
        searchNearbyPOIs(cat.query, userLocation, countryCode).then(results => {
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
          address: `Card drop · ${d.ownerName}`,
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

      const searchResults = await searchNearbyPOIs(category.query, userLocation, countryCode);
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

  const handleSelectResult = (result: SearchResult) => {
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
      setDropdownRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [showResults, results, recentLocations, isSearching, activeCategory]);

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
  const hasDisplayContent = hasSavedPOIs || displayResults.length > 0 || isSearching;

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
            Add Stop
          </Button>
        )}
      </div>
    );
  }

  if (!isLeader) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Waiting for leader to set destination...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative z-50 isolate space-y-3">
      {/* Quick category buttons */}
      <div className="flex gap-2">
        {quickCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border transition-all",
              "active:scale-95",
              activeCategory === cat.id
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-card border-border hover:bg-muted"
            )}
          >
            {cat.icon}
            <span className="text-xs font-medium">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Search input */}
      <div ref={inputWrapRef} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={handleFocus}
            placeholder={userLocation ? "Search nearby..." : "Search destination..."}
            className="pl-10 pr-10 bg-card border-border h-12 text-base"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
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
          title="Use my location"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <LocateFixed className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Results dropdown rendered in a portal so it overlays everything (chat, members, etc.) */}
      {showResults && hasDisplayContent && dropdownRect && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: dropdownRect.left,
            top: dropdownRect.top,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
          className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto animate-fade-in max-h-[60vh] overflow-y-auto"
        >
          {/* Saved POIs — idle state only */}
          {hasSavedPOIs && (
            <>
              <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <Bookmark className="w-3.5 h-3.5" />
                Saved places
              </div>
              {savedPOIs.map((poi, index) => (
                <button
                  key={poi.id}
                  onClick={() => handleSelectResult({ id: `poi:${poi.id}`, name: poi.name, address: 'Saved location', lat: poi.lat, lng: poi.lng })}
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
                    <p className="text-xs text-muted-foreground truncate mt-0.5">Saved location</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Recent destinations — idle state only */}
          {showRecent && (
            <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
              <Clock className="w-3.5 h-3.5" />
              Recent destinations
            </div>
          )}
          {activeCategory && !isSearching && (
            <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
              {quickCategories.find(c => c.id === activeCategory)?.icon}
              <span>Nearby {quickCategories.find(c => c.id === activeCategory)?.label}</span>
            </div>
          )}
          {isSearching ? (
            <div className="p-6 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <span className="text-sm">Finding places...</span>
            </div>
          ) : displayResults.length === 0 && !hasSavedPOIs ? (
            <div className="p-6 text-center text-muted-foreground">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <span className="text-sm">
                {!userLocation && query.length >= 2 && !isPostalSearch
                  ? "Tap the target icon to enable nearby search."
                  : userLocation && !isPostalSearch
                    ? "No nearby matches. Try a postcode to search farther."
                    : "No results found"}
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
                            ? `${Math.round(result.distance * 1000 * 3.281)} ft`
                            : `${(result.distance * 0.621371).toFixed(1)} mi`
                          : result.distance < 1
                            ? `${Math.round(result.distance * 1000)} m`
                            : `${result.distance.toFixed(1)} km`
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
