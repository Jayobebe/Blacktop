import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Search, MapPin, Loader2, Clock, Fuel, UtensilsCrossed, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MapSearchResult,
  MapViewBounds,
  QUICK_CATEGORIES,
  QuickCategory,
  getRecentLocations,
  saveRecentLocation,
  searchPlaces,
  searchNearbyPOIs,
} from '../lib/placeSearch';

const categoryIcons: Record<string, React.ReactNode> = {
  gas: <Fuel className="w-4 h-4" />,
  food: <UtensilsCrossed className="w-4 h-4" />,
  store: <ShoppingCart className="w-4 h-4" />,
  '24h': <Clock className="w-4 h-4" />,
};

interface MapSearchBarProps {
  map: MapLibreMap | null;
  userLocation: { lat: number; lng: number } | null;
  countryCode: string | null;
  onSelect: (result: MapSearchResult) => void;
}

function currentViewBounds(map: MapLibreMap | null): MapViewBounds | null {
  if (!map) return null;
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function MapSearchBar({ map, userLocation, countryCode, onSelect }: MapSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<MapSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentLocations(getRecentLocations());
  }, []);

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

  const performSearch = useCallback(
    async (searchQuery: string, currentSearchId: number) => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        // Read bounds fresh at search time rather than tracking them in
        // state, so panning the map doesn't re-render this component.
        const bias = currentViewBounds(map);
        const searchResults = await searchPlaces(searchQuery, bias, userLocation, countryCode);
        if (searchIdRef.current === currentSearchId) setResults(searchResults);
      } finally {
        if (searchIdRef.current === currentSearchId) setIsSearching(false);
      }
    },
    [map, userLocation, countryCode],
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    setShowResults(true);
    setActiveCategory(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setResults([]);
      return;
    }

    const currentSearchId = ++searchIdRef.current;
    debounceRef.current = setTimeout(() => performSearch(value, currentSearchId), 150);
  };

  const handleCategoryClick = async (category: QuickCategory) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setActiveCategory(category.id);
    setQuery('');
    setShowResults(true);
    setIsSearching(true);

    const currentSearchId = ++searchIdRef.current;

    if (!userLocation) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    try {
      const searchResults = await searchNearbyPOIs(category.query, userLocation, countryCode);
      if (searchIdRef.current === currentSearchId) setResults(searchResults);
    } finally {
      if (searchIdRef.current === currentSearchId) setIsSearching(false);
    }
  };

  const handleSelect = (result: MapSearchResult) => {
    saveRecentLocation(result);
    setRecentLocations(getRecentLocations());
    setQuery('');
    setResults([]);
    setShowResults(false);
    setActiveCategory(null);
    onSelect(result);
  };

  const showRecent = query.length < 2 && !activeCategory && recentLocations.length > 0;
  const displayResults = showRecent ? recentLocations : results;
  const hasDisplayContent = displayResults.length > 0 || isSearching;

  return (
    <div ref={containerRef} className="absolute top-3 left-3 right-3 z-10 space-y-2">
      <div className="flex gap-2 pr-12">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowResults(true)}
            placeholder="Search destination..."
            className="pl-10 bg-card/95 border-border h-11 text-sm shadow-lg backdrop-blur"
          />
        </div>
      </div>

      <div className="flex gap-1.5">
        {QUICK_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            className={cn(
              'flex items-center gap-1.5 py-1.5 px-3 rounded-full border text-xs font-medium shadow-lg backdrop-blur transition-all active:scale-95',
              activeCategory === cat.id
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-card/95 border-border hover:bg-muted',
            )}
          >
            {categoryIcons[cat.id]}
            {cat.label}
          </button>
        ))}
      </div>

      {showResults && hasDisplayContent && (
        <div className="bg-card/95 border border-border rounded-xl shadow-2xl overflow-hidden backdrop-blur max-h-[50vh] overflow-y-auto animate-fade-in">
          {showRecent && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
              <Clock className="w-3.5 h-3.5" />
              Recent destinations
            </div>
          )}
          {isSearching ? (
            <div className="p-5 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1.5" />
              <span className="text-sm">Finding places...</span>
            </div>
          ) : displayResults.length === 0 ? (
            <div className="p-5 text-center text-muted-foreground text-sm">No results found</div>
          ) : (
            displayResults.map((result, index) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors',
                  index !== displayResults.length - 1 && 'border-b border-border',
                )}
              >
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{result.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.address}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
