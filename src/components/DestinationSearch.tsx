import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, X, Loader2, LocateFixed, Clock } from 'lucide-react';
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

const RECENT_LOCATIONS_KEY = 'blacktop_recent_locations';
const MAX_RECENT_LOCATIONS = 4;

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
    // Remove if already exists (to move to top)
    const filtered = recent.filter(l => l.id !== location.id);
    // Add to top, keep max 4
    const updated = [location, ...filtered].slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get country code from coordinates using reverse geocoding
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

// Search places using OpenStreetMap Nominatim
async function searchPlaces(
  query: string, 
  userLocation: UserLocation | null,
  countryCode: string | null
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '10', // Fetch more to filter better
  });

  // Restrict to user's country if detected
  if (countryCode) {
    params.append('countrycodes', countryCode);
  }

  // Bias results toward user's location with tighter bounding
  if (userLocation) {
    // ~50km radius viewbox
    const delta = 0.45;
    params.append('viewbox', `${userLocation.lng - delta},${userLocation.lat + delta},${userLocation.lng + delta},${userLocation.lat - delta}`);
    params.append('bounded', '0');
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'Blacktop-App/1.0',
      },
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
      };
      
      // Calculate distance if we have user location
      if (userLocation) {
        result.distance = calculateDistance(
          userLocation.lat, userLocation.lng,
          result.lat, result.lng
        );
      }
      
      return result;
    });

    // Sort by distance if available, prioritize closer results
    if (userLocation) {
      results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    // Return top 5 results
    return results.slice(0, 5);
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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent locations on mount
  useEffect(() => {
    setRecentLocations(getRecentLocations());
  }, []);

  // Get user's location and country code on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          
          // Get country code for better filtering
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
        
        // Update country code
        const code = await getCountryCode(loc.lat, loc.lng);
        if (code) setCountryCode(code);
        
        toast.success('Location updated');
        setIsLocating(false);
      },
      (error) => {
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
      const searchResults = await searchPlaces(searchQuery, userLocation, countryCode);
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
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    
    // Debounce search by 300ms
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
  }, [performSearch]);

  const handleFocus = () => {
    setShowResults(true);
  };

  const handleSelectResult = (result: SearchResult) => {
    // Save to recent locations
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
  };

  const handleNavigate = () => {
    if (!destination) return;
    openNavigation(destination.lat, destination.lng, destination.name);
    onNavigate?.();
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Determine what to show in dropdown
  const showRecent = query.length < 2 && recentLocations.length > 0;
  const displayResults = showRecent ? recentLocations : results;
  const hasDisplayContent = displayResults.length > 0 || isSearching;

  // Show destination card if set
  if (destination) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{destination.name}</p>
            <p className="text-xs text-muted-foreground truncate">{destination.address}</p>
          </div>
          {isLeader && (
            <button
              onClick={onClearDestination}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        
        <Button
          onClick={handleNavigate}
          className="w-full mt-3 bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <Navigation className="w-4 h-4 mr-2" />
          Navigate
        </Button>
      </div>
    );
  }

  // Show search for leader only
  if (!isLeader) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Waiting for leader to set destination...</p>
      </div>
    );
  }

  return (
    <div className="relative z-50 isolate">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={handleFocus}
            placeholder={userLocation ? "Search nearby places..." : "Search destination..."}
            className="pl-10 pr-10 bg-card border-border"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>
        <button
          onClick={handleLocate}
          disabled={isLocating}
          className={cn(
            "p-3 rounded-lg border transition-colors",
            userLocation 
              ? "bg-accent/10 border-accent text-accent" 
              : "bg-card border-border text-muted-foreground hover:bg-muted"
          )}
          title="Use my location"
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LocateFixed className="w-4 h-4" />
          )}
        </button>
      </div>
      
      {userLocation && (
        <p className="text-xs text-muted-foreground mt-1">
          Searching near your location{countryCode ? ` (${countryCode})` : ''}
        </p>
      )}
      
      {showResults && hasDisplayContent && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 pointer-events-auto animate-fade-in">
          {showRecent && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Recent
            </div>
          )}
          {isSearching && query.length >= 2 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
              Searching...
            </div>
          ) : (
            displayResults.map((result) => (
              <button
                key={result.id}
                onClick={() => handleSelectResult(result)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left",
                  "hover:bg-muted transition-colors border-b border-border last:border-0"
                )}
              >
                {showRecent ? (
                  <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{result.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.address}</p>
                </div>
                {result.distance !== undefined && !showRecent && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {result.distance < 1 
                      ? `${Math.round(result.distance * 1000)}m` 
                      : `${result.distance.toFixed(1)}km`}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
