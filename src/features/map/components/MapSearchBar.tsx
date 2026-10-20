import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { takeMapSearch, useMapSearchSeq } from '../lib/mapCommand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Search, MapPin, Loader2, Clock, Bookmark, X, IdCard, Route as RouteIcon, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useShortLandscape } from '@/hooks/useShortLandscape';
import { useStripNudge } from '@/hooks/useStripNudge';
import {
  MapSearchResult,
  MapViewBounds,
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
import { useSavedRoutes, deleteSavedRoute, type SavedRoute } from '../lib/savedRoutes';
import { kmText } from '@/lib/units';
import { useSettings } from '@/features/settings';
import { useExperience, placeCategories, type PlaceCategory } from '@/features/experience';
import { formatDistance, getDistanceLabel } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { toast } from 'sonner';
import { resolveWhat3WordsResult } from '@/lib/what3words';
import { QuickChipRow } from '@/components/QuickChipRow';
import { PriceSigns } from '@/components/PlaceFacts';
import { openText, openTint, placeStatus } from '@/lib/openingHours';
import { currencySign } from '@/lib/priceLevel';

// km → miles for formatDistance (which expects miles input).
const KM_TO_MILES = 0.621371;

// Address line: clip with a gradient fade on the right edge instead of truncate.
const FADE_RIGHT = '[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] whitespace-nowrap overflow-hidden';

/** The card drops chip: Blacktop World's own, in the accent. */
const CARDS_CHIP = { id: 'cards' as const, label: tr("Cards"), query: 'cards', Icon: IdCard as LucideIcon, color: '' };
type Chip = PlaceCategory | typeof CARDS_CHIP;
/** How many of a quick search's places come back (all of them go on the map). */
const CATEGORY_MAX = 40;

/** Room the map leaves round a quick search's pins: below the search (or beside it in landscape), clear of the controls. */
export interface FitPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

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
  /**
   * A quick search's places, to put on the map and pull back to (null: take
   * them off). Sent once the list has drawn, with the room it leaves.
   */
  onCategory?: (category: PlaceCategory | null, results: MapSearchResult[], padding: FitPadding) => void;
  /**
   * A place picked from the list (any list but card drops): the map flies along
   * the way there and circles it, with its card and Navigate. Without it, a pick
   * goes straight to `onSelect`.
   */
  onPreview?: (result: MapSearchResult, category: string) => void;
  /** Bumped by the map when a route is set: the quick search is done. */
  clearSeq?: number;
  /** A saved route picked from the list: the map loads it as the route. */
  onRoute?: (route: SavedRoute) => void;
  /** Bumped by the map on Back from a place picked here: the list comes back, scrolled where it was. */
  reopenSeq?: number;
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

export function MapSearchBar({ map, userLocation, countryCode, onSelect, nearbyCards, inline, autoFocus, onCategory, onPreview, clearSeq, reopenSeq, onRoute }: MapSearchBarProps) {
  const savedRoutes = useSavedRoutes();
  const { settings } = useSettings();
  const { vehicles } = useExperience();
  // The top-up stop and the rest suit the vehicle; card search only for riders who collect.
  const quickCategories: Chip[] = [
    ...placeCategories(vehicles),
    ...(settings.blacktopWorldEnabled && settings.collectiblesEnabled ? [CARDS_CHIP] : []),
  ];
  const placeCategory = (id: string | null) => (id ? (quickCategories.find((c) => c.id === id && c.id !== 'cards') as PlaceCategory | undefined) ?? null : null);
  const distanceText = (lat: number, lng: number): string | null => {
    // what3words suggestions have no position until picked.
    if (!userLocation || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
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
  const listRef = useRef<HTMLDivElement>(null);
  /** A quick search's places, waiting for the list to draw before the map fits them in below it. */
  const fitPending = useRef<{ category: PlaceCategory; results: MapSearchResult[] } | null>(null);

  /** The room the search and its list take over the map. */
  const fitPadding = useCallback((): FitPadding => {
    const pad = { top: 48, bottom: 40, left: 32, right: 64 };
    const box = map?.getContainer().getBoundingClientRect();
    if (!box) return pad;
    for (const el of [containerRef.current, listRef.current]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > box.width * 0.6) pad.top = Math.max(pad.top, r.bottom - box.top + 20);
      else pad.left = Math.max(pad.left, r.right - box.left + 20);
    }
    // Never more than the map can give: MapLibre won't fit into nothing.
    pad.top = Math.min(pad.top, box.height * 0.6);
    pad.left = Math.min(pad.left, box.width * 0.6);
    return pad;
  }, [map]);

  useEffect(() => {
    const pending = fitPending.current;
    if (!pending || isSearching) return;
    fitPending.current = null;
    onCategory?.(pending.category, pending.results, fitPadding());
  }, [results, isSearching, onCategory, fitPadding]);

  // A route was set: the quick search is over.
  useEffect(() => {
    if (!clearSeq) return;
    searchIdRef.current++;
    setActiveCategory(null);
    setResults([]);
    setShowResults(false);
  }, [clearSeq]);

  // Back from a place picked in the list: the same list again, scrolled where it was.
  const listScrollRef = useRef(0);
  useEffect(() => {
    if (reopenSeq) setShowResults(true);
  }, [reopenSeq]);
  useLayoutEffect(() => {
    if (!showResults || !listRef.current || !listScrollRef.current) return;
    listRef.current.scrollTop = listScrollRef.current;
    listScrollRef.current = 0;
  }, [showResults]);

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
        // A quick search stays up with its pins (a tap on one opens it); card mode goes.
        setActiveCategory((prev) => (prev === 'cards' ? null : prev));
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
    // Typing ends a quick search, pins and all.
    if (placeCategory(activeCategory)) onCategory?.(null, [], fitPadding());
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

  const handleCategoryClick = async (category: Chip) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    const wasPlaces = !!placeCategory(activeCategory);

    if (category.id === 'cards') {
      if (wasPlaces) onCategory?.(null, [], fitPadding());
      setShowResults(true);
      setActiveCategory((prev) => {
        const next = prev === 'cards' ? null : 'cards';
        setCardsMode(next === 'cards');
        return next;
      });
      return;
    }

    // The chip that's lit: tapping it again takes its places off the map.
    if (activeCategory === category.id) {
      searchIdRef.current++;
      setActiveCategory(null);
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      onCategory?.(null, [], fitPadding());
      return;
    }

    setShowResults(true);
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
      const searchResults = await searchNearbyPOIs(category.query, origin, countryCode, { unnamed: category.unnamed, max: CATEGORY_MAX });
      if (searchIdRef.current === currentSearchId) {
        // On the map as soon as the list below the search has drawn (it sets the room left).
        fitPending.current = { category, results: searchResults };
        setResults(searchResults);
      }
    } finally {
      if (searchIdRef.current === currentSearchId) setIsSearching(false);
    }
  };

  // Blacktop Command asked for a search (a quick action, or its own search box): run it once the map is here.
  const mapSearchSeq = useMapSearchSeq();
  useEffect(() => {
    if (!map) return;
    const req = takeMapSearch();
    if (!req) return;
    if (req.category) {
      const chip = quickCategories.find((c) => c.id === req.category);
      if (chip && activeCategory !== chip.id) void handleCategoryClick(chip);
      return;
    }
    if (req.query) handleSearch(req.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSearchSeq, map]);

  const handleSelect = async (picked: MapSearchResult) => {
    // A what3words suggestion has no position until it's picked.
    const result = await resolveWhat3WordsResult(picked);
    if (!result) {
      toast.error(tr("Couldn't find that what3words address"));
      return;
    }
    // Looked at before it's ridden to: the map flies along the way there and circles it, its card has Navigate;
    // Back brings this list back. (Card drops go straight to theirs.)
    if (onPreview && !cardsMode) {
      const quick = placeCategory(activeCategory);
      const saved = result.id.startsWith('poi:');
      const recent = !saved && recentLocations.some((r) => r.id === result.id);
      listScrollRef.current = listRef.current?.scrollTop ?? 0;
      setShowResults(false);
      onPreview(result, quick ? quick.label : saved ? tr("Saved place") : recent ? tr("Visited recently") : result.address || result.name);
      return;
    }
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
  const hasRoutes = !!onRoute && savedRoutes.length > 0;
  const hasIdleContent = showIdle && (hasSavedPOIs || hasRecent || hasRoutes);

  // Live-search state.
  const displayResults = cardsMode ? sortedCards : results;
  const routeMatch = hasRoutes && query.trim().length >= 2 && savedRoutes.some((r) => normaliseName(r.name).includes(normaliseName(query.trim())));
  const hasSearchContent = !showIdle && (displayResults.length > 0 || isSearching || cardsMode || routeMatch);

  const hasDisplayContent = hasIdleContent || hasSearchContent;
  // Landscape (short:) with suggestions up: they run sideways in the top row, right of the search column.
  const strip = showResults && hasDisplayContent;
  const shortLandscape = useShortLandscape();
  const nudging = useStripNudge(strip && shortLandscape);

  return (
    <div
      ref={containerRef}
      className={cn(
        'space-y-2 pointer-events-none',
        inline
          ? 'relative z-30 w-full'
          : 'absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(0.75rem+var(--safe-left))] right-[calc(4.25rem+var(--safe-right))] z-30',
      )}
    >
      {/* Stops short of the MapLibre control column (zoom/compass/locate) so it never
          covers them; the wrapper itself ignores taps and only its children take them. */}
      <div data-tip="map-search" className="flex gap-2 pointer-events-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowResults(true)}
            autoFocus={autoFocus}
            placeholder={tr("Search destination...")}
            className="pl-10 bg-card/95 border-border h-12 short:h-9 rounded-xl text-sm shadow-lg backdrop-blur"
          />
        </div>
      </div>

      {/* Each in its own colour, the one that's on filled with it (card drops in the accent): as many as fit, then "+N".
          Landscape (short:): the chips only come out while searching, to leave the map clear
          (kept out while a quick search is up, so its lit chip can be tapped off). */}
      <QuickChipRow
        items={quickCategories}
        active={activeCategory}
        onPick={handleCategoryClick}
        look="compact"
        resetKey={clearSeq}
        className={cn(!showResults && !placeCategory(activeCategory) && 'short:hidden')}
      />

      {showResults && hasDisplayContent && (
        <div ref={listRef} style={{ '--strip-h': placeCategory(activeCategory) ? '3rem' : '2.25rem' } as React.CSSProperties}
          className={cn('suggest-list absolute left-0 right-0 top-full mt-2 short:top-0 short:!mt-0 short:left-[calc(100%+0.5rem)] short:right-auto short:w-[calc(100vw-27.5rem-var(--safe-left)-var(--safe-right))] pointer-events-auto bg-card/95 border border-border rounded-xl shadow-2xl overflow-hidden backdrop-blur max-h-[min(50dvh,16rem)] overflow-y-auto animate-fade-in', nudging && 'suggest-nudge')}>


          {/* ── Saved routes (Blacktop Command → Save a route): all of them idle, the ones that match while typing ── */}
          {onRoute && !activeCategory && !cardsMode && (() => {
            const q = normaliseName(query.trim());
            const list = q ? savedRoutes.filter((r) => normaliseName(r.name).includes(q)) : showIdle ? savedRoutes : [];
            if (!list.length) return null;
            return (
              <>
                <div className="suggest-head px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
                  <RouteIcon className="w-3.5 h-3.5" />
                  {tr("Saved routes")}
                </div>
                {list.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setShowResults(false);
                      setQuery('');
                      onRoute(r);
                    }}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors group border-b border-border"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                      <RouteIcon className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      <p className={cn('text-xs text-muted-foreground', FADE_RIGHT)}>
                        {tr("Saved route")} · {kmText(r.distanceMeters / 1000)}
                      </p>
                    </div>
                    {/* Delete button, as on saved places; its offline map goes with it. */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteSavedRoute(r.id);
                      }}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0"
                      aria-label={tr("Remove {0}", [r.name])}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))}
              </>
            );
          })()}

          {/* ── Saved POIs (idle state only) ── */}
          {showIdle && hasSavedPOIs && (
            <>
              <div className="suggest-head px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
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
              <div className="suggest-head px-4 py-2 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5 bg-muted/50">
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
                const quick = !cardsMode ? placeCategory(activeCategory) : null;
                if (quick) {
                  // A quick search's place: its category tile, as on the map; the nearest marked; tinted green while
                  // it's open and red while it's shut, and how dear it is where that's known.
                  const status = placeStatus(result.hours);
                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 active:bg-accent/20 transition-colors',
                        openTint(status),
                        index !== displayResults.length - 1 && 'border-b border-border',
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white" style={{ background: quick.color }}>
                        <quick.Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{result.name}</p>
                        {(index === 0 || (result.address && result.address !== result.name)) && (
                          <p className={cn('text-xs text-muted-foreground short:hidden', FADE_RIGHT)}>{index === 0 ? tr("Nearest") : result.address}</p>
                        )}
                        {status && <p className={cn('text-[11px] font-semibold', openText(status), FADE_RIGHT)}>{status.label}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
                        {distanceText(result.lat, result.lng) && (
                          <span className="text-[10px] font-mono text-muted-foreground/80">{distanceText(result.lat, result.lng)}</span>
                        )}
                        {result.price && <PriceSigns info={result.price} sign={currencySign(countryCode)} className="text-[11px]" />}
                      </div>
                    </button>
                  );
                }
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
