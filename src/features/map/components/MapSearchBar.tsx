import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Search, MapPin, Loader2, Clock, Fuel, UtensilsCrossed, ShoppingCart, Bookmark, X, IdCard, Droplet, BatteryCharging } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MapSearchResult,
  MapViewBounds,
  QUICK_CATEGORIES,
  QuickCategory,
  getRecentLocations,
  normaliseName,
  removeRecentLocation,
  searchLoadedPlaces,
  saveRecentLocation,
  searchPlaces,
  searchNearbyPOIs,
  calculateDistance,
} from '../lib/placeSearch';
import { getSavedPOIs, poiToSearchResult, deletePOI, type SavedPOI } from '../lib/poiStore';
import { useSettings } from '@/features/settings';
import { useExperience, refuelCategory } from '@/features/experience';
import { formatDistance, getDistanceLabel } from '@/lib/format';
import { tr } from '@/lib/i18n';

// km → miles for formatDistance (which expects miles input).
const KM_TO_MILES = 0.621371;

// Address line: clip with a gradient fade on the right edge instead of truncate.
const FADE_RIGHT = '[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] whitespace-nowrap overflow-hidden';

const categoryIcons: Record<string, React.ReactNode> = {
  gas: <Fuel className="w-4 h-4" />,
  water: <Droplet className="w-4 h-4" />,
  charge: <BatteryCharging className="w-4 h-4" />,
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
  /** Render in the parent's flow (the map's top-left column) instead of pinned to the map's top edge. */
  inline?: boolean;
  /** Open straight into typing (e.g. "Add stop"). */
  autoFocus?: boolean;
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

export function MapSearchBar({ map, userLocation, countryCode, onSelect, nearbyCards, inline, autoFocus }: MapSearchBarProps) {
  const { settings } = useSettings();
  const { vehicles } = useExperience();
  // Top-up stop matches the vehicle; card search only for riders who collect.
  const quickCategories: QuickCategory[] = QUICK_CATEGORIES.map((c) => (c.id === 'gas' ? refuelCategory(vehicles) : c)).filter(
    (c) => c.id !== 'cards' || (settings.blacktopWorldEnabled && settings.collectiblesEnabled)
  );
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
  /** A recent suggestion whose clock was tapped: it offers Remove instead of its distance. */
  const [removingRecent, setRemovingRecent] = useState<string | null>(null);
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
        const anchor =
          userLocation ?? (bias ? { lat: (bias.north + bias.south) / 2, lng: (bias.east + bias.west) / 2 } : null);

        // Saved places and recents first (ignoring case and apostrophes, so
        // "mcdonalds" finds "McDonald's").
        const q = normaliseName(searchQuery);
        const matchingPOIs = savedPOIs.filter((p) => normaliseName(p.name).includes(q)).map(poiToSearchResult);
        const matchingRecents = recentLocations.filter(
          (r) => normaliseName(r.name).includes(q) || normaliseName(r.address ?? '').includes(q),
        );

        // Then places: what's on the map right now (instant, from the tiles), merged with
        // the online search, nearest first, same place (name within ~100 m) only once.
        const merge = (places: MapSearchResult[]) => {
          const seenIds = new Set<string>();
          const kept: MapSearchResult[] = [];
          for (const r of places) {
            if (seenIds.has(r.id)) continue;
            seenIds.add(r.id);
            const dup = kept.some(
              (k) => normaliseName(k.name) === normaliseName(r.name) && calculateDistance(k.lat, k.lng, r.lat, r.lng) < 0.1,
            );
            if (!dup) kept.push(r);
          }
          if (anchor) kept.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
          const firstIds = new Set([...matchingPOIs, ...matchingRecents].map((r) => r.id));
          return [...matchingPOIs, ...matchingRecents, ...kept.filter((r) => !firstIds.has(r.id)).slice(0, 10)];
        };

        const onMap = searchLoadedPlaces(map, searchQuery, anchor);
        if (onMap.length && searchIdRef.current === currentSearchId) setResults(merge(onMap));

        const remoteResults = await searchPlaces(searchQuery, bias, userLocation, countryCode);
        if (searchIdRef.current === currentSearchId) setResults(merge([...onMap, ...remoteResults]));
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
    // The free search service allows ~1 request/sec; faster typing got blocked (empty results).
    debounceRef.current = setTimeout(() => performSearch(value, currentSearchId), 450);
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

    const view = currentViewBounds(map);
    const origin = userLocation
      ?? (view ? { lat: (view.north + view.south) / 2, lng: (view.east + view.west) / 2 } : null);
    if (!origin) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    try {
      const searchResults = await searchNearbyPOIs(category.query, origin, countryCode);
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
    <div
      ref={containerRef}
      className={cn(
        'space-y-2 pointer-events-none',
        inline
          ? 'relative z-30 w-full'
          : 'absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(4.25rem+env(safe-area-inset-right))] z-30',
      )}
    >
      {/* Stops short of the MapLibre control column (zoom/compass/locate) so it never
          covers them; the wrapper itself ignores taps and only its children take them. */}
      <div className="flex gap-2 pointer-events-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowResults(true)}
            autoFocus={autoFocus}
            placeholder={tr("Search destination...")}
            className="pl-10 bg-card/95 border-border h-11 short:h-9 text-sm shadow-lg backdrop-blur"
          />
        </div>
      </div>

      {/* Landscape (short:): the chips only come out while searching, to leave the map clear. */}
      <div className={cn('flex gap-1.5 w-fit max-w-full overflow-x-auto scrollbar-hide pointer-events-auto', !showResults && 'short:hidden')}>
        {quickCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            aria-pressed={cat.id === 'cards' ? cardsMode : activeCategory === cat.id}
            className={cn(
              'flex flex-shrink-0 items-center gap-1.5 py-1.5 px-3 rounded-full border text-xs font-medium shadow-lg backdrop-blur transition-all active:scale-95',
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
        <div className="absolute left-0 right-0 top-full mt-2 pointer-events-auto bg-card/95 border border-border rounded-xl shadow-2xl overflow-hidden backdrop-blur max-h-[min(50dvh,16rem)] overflow-y-auto animate-fade-in">


          {/* ── Saved POIs (idle state only) ── */}
          {showIdle && hasSavedPOIs && (
            <>
              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                <Bookmark className="w-3.5 h-3.5" />
                {tr("Saved places")}
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
                      <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>{tr("Saved location")}</p>
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
                      aria-label={tr("Remove {0}", [poi.name])}
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
                {tr("Recent destinations")}
              </div>
              {recentLocations.map((result, index) => {
                const removing = removingRecent === result.id;
                return (
                  <div
                    key={result.id}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 hover:bg-accent/10 transition-colors',
                      index !== recentLocations.length - 1 && 'border-b border-border',
                    )}
                  >
                    {/* The clock: tap for Remove (tap again to keep it). */}
                    <button
                      onClick={() => setRemovingRecent(removing ? null : result.id)}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                        removing ? 'bg-destructive/15' : 'bg-accent/10 hover:bg-accent/20',
                      )}
                      aria-label={removing ? tr("Keep {0}", [result.name]) : tr("Remove {0} from recent destinations", [result.name])}
                    >
                      {removing ? <X className="w-3.5 h-3.5 text-destructive" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => handleSelect(result)} className="flex-1 min-w-0 text-left active:opacity-70">
                      <p className="font-semibold text-sm truncate">{result.name}</p>
                      <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>{result.address}</p>
                    </button>
                    {removing ? (
                      <button
                        onClick={() => {
                          removeRecentLocation(result.id);
                          setRecentLocations(getRecentLocations());
                          setRemovingRecent(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold flex-shrink-0"
                      >
                        {tr("Remove")}
                      </button>
                    ) : (
                      distanceText(result.lat, result.lng) && (
                        <span className="text-[10px] font-mono text-muted-foreground/80 flex-shrink-0 ml-1">
                          {distanceText(result.lat, result.lng)}
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Live search results ── */}
          {!showIdle && (
            isSearching ? (
              <div className="p-5 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1.5" />
                <span className="text-sm">{tr("Finding places...")}</span>
              </div>
            ) : displayResults.length === 0 ? (
              <div className="p-5 text-center text-muted-foreground text-sm">
                {cardsMode ? tr("No cards dropped nearby") : tr("No results found")}
                {!cardsMode && (() => {
                  // Places come from OpenStreetMap: a missing one can be reported there
                  // (an OSM note needs no account) and shows up once a mapper adds it.
                  const at = map?.getCenter() ?? userLocation;
                  const href = at
                    ? `https://www.openstreetmap.org/note/new#map=18/${at.lat.toFixed(5)}/${at.lng.toFixed(5)}`
                    : "https://www.openstreetmap.org/note/new";
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block mt-2 text-xs text-accent underline">
                      {tr("Missing a place? Add it to OpenStreetMap")}
                    </a>
                  );
                })()}
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
