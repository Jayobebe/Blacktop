import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Search, MapPin, Loader2, Clock, Fuel, UtensilsCrossed, ShoppingCart, Bookmark, X, IdCard } from 'lucide-react';
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
  calculateDistance,
} from '../lib/placeSearch';
import { getSavedPOIs, poiToSearchResult, deletePOI, type SavedPOI } from '../lib/poiStore';
import { useSettings } from '@/features/settings';
import { formatDistance, getDistanceLabel } from '@/lib/format';

// km → miles for formatDistance (which expects miles input).
const KM_TO_MILES = 0.621371;

// Address line: clip with a gradient fade on the right edge instead of truncate.
const FADE_RIGHT = '[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] whitespace-nowrap overflow-hidden';

const categoryIcons: Record<string, React.ReactNode> = {
  gas: <Fuel className="w-4 h-4" />,
  food: <UtensilsCrossed className="w-4 h-4" />,
  store: <ShoppingCart className="w-4 h-4" />,
  cards: <IdCard className="w-4 h-4" />,
};

interface MapSearchBarProps {
  map: MapLibreMap | null;
  userLocation: { lat: number; lng: number } | null;
  countryCode: string | null;
  onSelect: (result: MapSearchResult) => void;
  /** Card drops nearby — when provided, a "Nearby cards" toggle is shown. */
  nearbyCards?: MapSearchResult[];
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

export function MapSearchBar({ map, userLocation, countryCode, onSelect, nearbyCards }: MapSearchBarProps) {
  const { settings } = useSettings();
  const distanceText = (lat: number, lng: number): string | null => {
    if (!userLocation) return null;
    const km = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
    const miles = km * KM_TO_MILES;
    return `${formatDistance(miles, settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`;
  };

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cardsMode, setCardsMode] = useState(false);
  const [recentLocations, setRecentLocations] = useState<MapSearchResult[]>([]);
  const [savedPOIs, setSavedPOIs] = useState<SavedPOI[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshSavedPOIs = useCallback(() => {
    setSavedPOIs(getSavedPOIs());
  }, []);

  useEffect(() => {
    setRecentLocations(getRecentLocations());
    refreshSavedPOIs();
  }, [refreshSavedPOIs]);

  // Refresh saved POIs whenever the map saves or deletes one (cross-component).
  useEffect(() => {
    window.addEventListener('blacktop-poi-saved', refreshSavedPOIs);
    return () => window.removeEventListener('blacktop-poi-saved', refreshSavedPOIs);
  }, [refreshSavedPOIs]);

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
        const bias = currentViewBounds(map);
        const [remoteResults] = await Promise.all([
          searchPlaces(searchQuery, bias, userLocation, countryCode),
        ]);

        // Prepend any saved POIs whose names contain the query string so
        // personal spots always surface first, before Nominatim results.
        const q = searchQuery.toLowerCase();
        const matchingPOIs = savedPOIs
          .filter(p => p.name.toLowerCase().includes(q))
          .map(poiToSearchResult);

        // Also surface recent destinations matching the query as "local results".
        const matchingRecents = recentLocations.filter(
          r => r.name.toLowerCase().includes(q) || (r.address?.toLowerCase().includes(q) ?? false),
        );

        // Deduplicate across saved POIs, recents, and remote results by id.
        const seen = new Set<string>();
        const merged: MapSearchResult[] = [];
        for (const r of [...matchingPOIs, ...matchingRecents, ...remoteResults]) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          merged.push(r);
        }

        if (searchIdRef.current === currentSearchId) setResults(merged);
      } finally {
        if (searchIdRef.current === currentSearchId) setIsSearching(false);
      }
    },
    [map, userLocation, countryCode, savedPOIs, recentLocations],
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    setShowResults(true);
    setActiveCategory(null);
    setCardsMode(false);

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
    setQuery('');
    setShowResults(true);

    if (category.id === 'cards') {
      setActiveCategory((prev) => {
        const next = prev === 'cards' ? null : 'cards';
        setCardsMode(next === 'cards');
        return next;
      });
      return;
    }

    setActiveCategory(category.id);
    setCardsMode(false);
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
    setCardsMode(false);
    onSelect(result);
  };

  const handleDeletePOI = (e: React.MouseEvent, poiId: string) => {
    e.stopPropagation();
    // poiId is in the form `poi:{uuid}` — strip the prefix to get the raw id.
    const rawId = poiId.replace(/^poi:/, '');
    deletePOI(rawId);
  };

  const sortedCards = (nearbyCards ?? [])
    .slice()
    .sort((a, b) =>
      userLocation
        ? calculateDistance(userLocation.lat, userLocation.lng, a.lat, a.lng) -
          calculateDistance(userLocation.lat, userLocation.lng, b.lat, b.lng)
        : 0,
    );

  // Idle state (no query, no active category): show saved POIs + recent locations.
  const showIdle = query.length < 2 && !activeCategory && !cardsMode;
  const hasSavedPOIs = savedPOIs.length > 0;
  const hasRecent = recentLocations.length > 0;
  const hasIdleContent = showIdle && (hasSavedPOIs || hasRecent);

  // Live-search state.
  const displayResults = cardsMode ? sortedCards : results;
  const hasSearchContent = !showIdle && (displayResults.length > 0 || isSearching || cardsMode);

  const hasDisplayContent = hasIdleContent || hasSearchContent;

  return (
    <div ref={containerRef} className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] z-30 space-y-2">
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

      <div className="flex gap-1.5 pr-12">
        {QUICK_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            aria-pressed={cat.id === 'cards' ? cardsMode : activeCategory === cat.id}
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
        <div className="absolute left-0 right-12 top-full mt-2 bg-card/95 border border-border rounded-xl shadow-2xl overflow-hidden backdrop-blur max-h-[min(50dvh,16rem)] overflow-y-auto animate-fade-in">


          {/* ── Saved POIs (idle state only) ── */}
          {showIdle && hasSavedPOIs && (
            <>
              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <Bookmark className="w-3.5 h-3.5" />
                Saved places
              </div>
              {savedPOIs.map((poi, index) => {
                const result = poiToSearchResult(poi);
                return (
                  <button
                    key={poi.id}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors group',
                      (index !== savedPOIs.length - 1 || hasRecent) && 'border-b border-border',
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                      <Bookmark className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{poi.name}</p>
                      <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>Saved location</p>
                    </div>
                    {distanceText(poi.lat, poi.lng) && (
                      <span className="text-[10px] font-mono text-muted-foreground/80 flex-shrink-0 ml-1">
                        {distanceText(poi.lat, poi.lng)}
                      </span>
                    )}
                    {/* Delete button — only visible on hover so it doesn't clutter the list */}
                    <button
                      onClick={(e) => handleDeletePOI(e, result.id)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0"
                      aria-label={`Remove ${poi.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </button>
                );
              })}
            </>
          )}

          {/* ── Recent destinations (idle state only) ── */}
          {showIdle && hasRecent && (
            <>
              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <Clock className="w-3.5 h-3.5" />
                Recent destinations
              </div>
              {recentLocations.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors',
                    index !== recentLocations.length - 1 && 'border-b border-border',
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{result.name}</p>
                    <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>{result.address}</p>
                  </div>
                  {distanceText(result.lat, result.lng) && (
                    <span className="text-[10px] font-mono text-muted-foreground/80 flex-shrink-0 ml-1">
                      {distanceText(result.lat, result.lng)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* ── Live search results ── */}
          {!showIdle && (
            isSearching ? (
              <div className="p-5 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1.5" />
                <span className="text-sm">Finding places...</span>
              </div>
            ) : displayResults.length === 0 ? (
              <div className="p-5 text-center text-muted-foreground text-sm">
                {cardsMode ? 'No cards dropped nearby' : 'No results found'}
              </div>
            ) : (
              displayResults.map((result, index) => {
                const isCard = result.id.startsWith('card:');
                const isSavedPOI = result.id.startsWith('poi:');
                const isRecent = !isSavedPOI && recentLocations.some(r => r.id === result.id);
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors',
                      index !== displayResults.length - 1 && 'border-b border-border',
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      isSavedPOI ? 'bg-accent/15' : isRecent ? 'bg-muted' : 'bg-accent/10',
                    )}>
                      {isCard
                        ? <IdCard className="w-3.5 h-3.5 text-accent" />
                        : isSavedPOI
                        ? <Bookmark className="w-3.5 h-3.5 text-accent" />
                        : isRecent
                          ? <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          : <MapPin className="w-4 h-4 text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{result.name}</p>
                      <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>{result.address}</p>
                    </div>
                    {distanceText(result.lat, result.lng) && (
                      <span className="text-[10px] font-mono text-muted-foreground/80 flex-shrink-0 ml-1">
                        {distanceText(result.lat, result.lng)}
                      </span>
                    )}
                  </button>
                );
              })
            )
          )}
        </div>
      )}
    </div>
  );
}
