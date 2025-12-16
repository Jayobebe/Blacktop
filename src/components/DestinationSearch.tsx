import { useState, useCallback, useEffect } from 'react';
import { Search, MapPin, Navigation, X, Loader2, LocateFixed } from 'lucide-react';
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
}

interface DestinationSearchProps {
  destination: ConvoyDestination | null;
  onSetDestination: (destination: ConvoyDestination) => void;
  onClearDestination: () => void;
  isLeader: boolean;
}

interface UserLocation {
  lat: number;
  lng: number;
}

// Search places using OpenStreetMap Nominatim (free, no API key needed)
async function searchPlaces(query: string, userLocation: UserLocation | null): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '5',
  });

  // Bias results toward user's location if available
  if (userLocation) {
    params.append('viewbox', `${userLocation.lng - 0.5},${userLocation.lat + 0.5},${userLocation.lng + 0.5},${userLocation.lat - 0.5}`);
    params.append('bounded', '0'); // Prefer but don't restrict to viewbox
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'Blacktop-App/1.0',
      },
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();

    return data.map((place: any) => ({
      id: place.place_id.toString(),
      name: place.name || place.display_name.split(',')[0],
      address: place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
    }));
  } catch (error) {
    console.error('Place search failed:', error);
    return [];
  }
}

export function DestinationSearch({
  destination,
  onSetDestination,
  onClearDestination,
  isLeader,
}: DestinationSearchProps) {
  const { openNavigation } = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Get user's location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
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
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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

  const handleSearch = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);
    
    if (searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    
    setIsSearching(true);
    setShowResults(true);
    
    try {
      const searchResults = await searchPlaces(searchQuery, userLocation);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [userLocation]);

  const handleSelectResult = (result: SearchResult) => {
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
  };

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
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
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
          Searching near your location
        </p>
      )}
      
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 pointer-events-auto animate-fade-in">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleSelectResult(result)}
              className={cn(
                "w-full flex items-center gap-3 p-3 text-left",
                "hover:bg-muted transition-colors border-b border-border last:border-0"
              )}
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate text-sm">{result.name}</p>
                <p className="text-xs text-muted-foreground truncate">{result.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}