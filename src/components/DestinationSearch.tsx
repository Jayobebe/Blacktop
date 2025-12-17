import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, X, Loader2, LocateFixed, Clock, Fuel, Coffee, UtensilsCrossed, ShoppingCart, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConvoyDestination } from '@/types/convoy';
import { useNavigation } from '@/hooks/useNavigation';
import { toast } from 'sonner';

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
  onNavigate?: () => void;
  isLeader: boolean;
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

const quickCategories: QuickCategory[] = [
  { id: 'gas', label: 'Gas', icon: <Fuel className="w-4 h-4" />, query: 'gas station' },
  { id: 'food', label: 'Food', icon: <UtensilsCrossed className="w-4 h-4" />, query: 'restaurant' },
  { id: 'coffee', label: 'Coffee', icon: <Coffee className="w-4 h-4" />, query: 'coffee shop' },
  { id: 'store', label: 'Store', icon: <ShoppingCart className="w-4 h-4" />, query: 'convenience store' },
];

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

async function getCountryCode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3`,
      { headers: { 'User-Agent': 'Blacktop-App/1.0' } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.address?.country_code?.toUpperCase() || null;
  } catch {
    return null;
  }
}

// Max distance in km for category searches (nearby places)
const MAX_NEARBY_DISTANCE_KM = 25;

async function searchPlaces(
  query: string, 
  userLocation: UserLocation | null,
  countryCode: string | null,
  isCategory: boolean = false
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '20', // Fetch more to filter by distance
  });

  if (countryCode) {
    params.append('countrycodes', countryCode);
  }

  // Tighter viewbox for category searches (nearby POIs)
  if (userLocation) {
    const delta = isCategory ? 0.15 : 0.5; // ~15km for categories, ~50km for general
    params.append('viewbox', `${userLocation.lng - delta},${userLocation.lat + delta},${userLocation.lng + delta},${userLocation.lat - delta}`);
    params.append('bounded', isCategory ? '1' : '0'); // Strict bounds for categories
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'Blacktop-App/1.0' },
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();

    let results: SearchResult[] = data.map((place: any) => {
      const result: SearchResult = {
        id: place.place_id.toString(),
        name: place.name || place.display_name.split(',')[0],
        address: place.display_name,
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon),
        type: place.type,
      };
      
      if (userLocation) {
        result.distance = calculateDistance(
          userLocation.lat, userLocation.lng,
          result.lat, result.lng
        );
      }
      
      return result;
    });

    // Sort by distance
    if (userLocation) {
      results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      
      // For category searches, filter to only nearby results
      if (isCategory) {
        results = results.filter(r => (r.distance || 0) < MAX_NEARBY_DISTANCE_KM);
      }
    }

    return results.slice(0, 6);
  } catch (error) {
    console.error('Place search failed:', error);
    return [];
  }
}

export function DestinationSearch({
  destination,
  onSetDestination,
  onClearDestination,
  onNavigate,
  isLeader,
}: DestinationSearchProps) {
  const { openNavigation } = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<SearchResult[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentLocations(getRecentLocations());
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          const code = await getCountryCode(loc.lat, loc.lng);
          if (code) setCountryCode(code);
        },
        (error) => {
          console.warn('Could not get location:', error.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
        setUserLocation(loc);
        const code = await getCountryCode(loc.lat, loc.lng);
        if (code) setCountryCode(code);
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

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const searchResults = await searchPlaces(searchQuery, userLocation, countryCode, false);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [userLocation, countryCode]);

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
    
    // Fast 150ms debounce
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 150);
  }, [performSearch]);

  const handleCategoryClick = async (category: QuickCategory) => {
    setActiveCategory(category.id);
    setQuery('');
    setShowResults(true);
    setIsSearching(true);
    
    try {
      const searchResults = await searchPlaces(category.query, userLocation, countryCode, true);
      setResults(searchResults);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
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

  const handleNavigate = () => {
    if (!destination) return;
    openNavigation(destination.lat, destination.lng, destination.name);
    onNavigate?.();
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const showRecent = query.length < 2 && !activeCategory && recentLocations.length > 0;
  const displayResults = showRecent ? recentLocations : results;
  const hasDisplayContent = displayResults.length > 0 || isSearching;

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
        
        <Button
          onClick={handleNavigate}
          className="w-full mt-3 bg-accent hover:bg-accent/90 text-accent-foreground h-12 text-base font-semibold"
        >
          <Navigation className="w-5 h-5 mr-2" />
          Navigate
        </Button>
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
      <div className="flex gap-2">
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
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
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
      
      {/* Results dropdown */}
      {showResults && hasDisplayContent && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 pointer-events-auto animate-fade-in max-h-[60vh] overflow-y-auto">
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
          ) : displayResults.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <span className="text-sm">No results found</span>
            </div>
          ) : (
            displayResults.map((result, index) => (
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
                  showRecent ? "bg-muted" : "bg-accent/10"
                )}>
                  {showRecent ? (
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <MapPin className="w-5 h-5 text-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{result.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{result.address}</p>
                </div>
                {result.distance !== undefined && !showRecent && (
                  <div className="flex-shrink-0 text-right">
                    <span className="text-sm font-medium text-accent">
                      {result.distance < 1 
                        ? `${Math.round(result.distance * 1000)}m` 
                        : `${result.distance.toFixed(1)}km`}
                    </span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
