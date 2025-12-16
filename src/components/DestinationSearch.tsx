import { useState, useCallback } from 'react';
import { Search, MapPin, Navigation, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConvoyDestination } from '@/types/convoy';

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

// Mock search results - in production, integrate with Google Places or Mapbox
const mockSearch = async (query: string): Promise<SearchResult[]> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (!query.trim()) return [];
  
  // Simulated results based on query
  return [
    {
      id: '1',
      name: `${query} - Downtown`,
      address: `123 Main St, ${query}`,
      lat: 40.7128 + Math.random() * 0.1,
      lng: -74.0060 + Math.random() * 0.1,
    },
    {
      id: '2',
      name: `${query} Plaza`,
      address: `456 Oak Ave, ${query}`,
      lat: 40.7128 + Math.random() * 0.1,
      lng: -74.0060 + Math.random() * 0.1,
    },
    {
      id: '3',
      name: `${query} Center`,
      address: `789 Pine Blvd, ${query}`,
      lat: 40.7128 + Math.random() * 0.1,
      lng: -74.0060 + Math.random() * 0.1,
    },
  ];
};

function getNavigationUrl(destination: ConvoyDestination): string {
  const { lat, lng } = destination;
  
  // Detect platform and return appropriate deep link
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  if (isIOS) {
    // Apple Maps deep link
    return `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  } else if (isAndroid) {
    // Google Maps deep link for Android
    return `google.navigation:q=${lat},${lng}&mode=d`;
  } else {
    // Fallback to Google Maps web
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
}

export function DestinationSearch({
  destination,
  onSetDestination,
  onClearDestination,
  isLeader,
}: DestinationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

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
      const searchResults = await mockSearch(searchQuery);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

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
    window.open(getNavigationUrl(destination), '_blank');
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
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search destination..."
          className="pl-10 pr-10 bg-card border-border"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>
      
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-10 animate-fade-in">
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