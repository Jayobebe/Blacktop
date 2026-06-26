import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './blacktopMap.css';
import { useRadarOverlay } from '../hooks/useRadarOverlay';
import { registerTileCacheProtocol, toCachedTileUrl } from '../lib/tileCache';
import { getCountryCode } from '../lib/placeSearch';
import { fetchRouteThroughStops, metersToMiles, RouteResult } from '../lib/routing';
import { useWaypointRouteStops } from '@/features/waypoints';
import { MapSearchBar } from './MapSearchBar';
import { MapDestination } from '../types';
import { useMapPresentUserIds } from '../hooks/useMapPresence';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { useActiveRide } from '@/features/ride';
import { useConvoyMembers, useConvoyState } from '@/features/convoy';
import { useSpeakingUsers } from '@/features/voice';
import { getMemberColorStyles } from '@/lib/memberColors';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Navigation, Loader2 } from 'lucide-react';

function createMemberMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.borderRadius = '50%';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.fontSize = '13px';
  el.style.fontWeight = '700';
  el.style.fontFamily = 'inherit';
  el.style.border = '2px solid transparent';
  el.style.transition = 'box-shadow 150ms ease, transform 150ms ease';
  return el;
}

// `headingRef.current` is sourced from device sensors and can occasionally
// be a non-finite glitch value; falling back to `map.getBearing()` (always
// finite) keeps a bad reading from poisoning MapLibre's camera matrix.
function safeBearing(heading: number | null, map: MapLibreMap): number {
  return heading != null && Number.isFinite(heading) ? heading : map.getBearing();
}

function applyMemberMarkerStyle(
  el: HTMLDivElement,
  name: string,
  colorStyles: ReturnType<typeof getMemberColorStyles>,
  isSpeaking: boolean,
) {
  el.textContent = (name.trim()[0] || '?').toUpperCase();
  el.style.backgroundColor = colorStyles.bg;
  el.style.borderColor = colorStyles.border;
  el.style.color = colorStyles.text;
  el.style.boxShadow = isSpeaking ? colorStyles.glow : 'none';
  el.style.transform = isSpeaking ? 'scale(1.15)' : 'scale(1)';
}

const ROUTE_SOURCE_ID = 'blacktop-route';
const ROUTE_CASING_LAYER_ID = 'blacktop-route-casing';
const ROUTE_LINE_LAYER_ID = 'blacktop-route-line';

// How long to hold off the heading-up auto-follow camera after the rider
// manually pans/zooms/rotates the map, so a deliberate look-around isn't
// immediately snapped back to their position.
const LOCATE_RESUME_DELAY_MS = 10000;

interface BlacktopMapProps {
  initialDestination?: MapDestination | null;
  onContextLost?: () => void;
}

// Register the cache-backed `blacktop-tile://` protocol before any Map is
// constructed so the basemap tiles below resolve through IndexedDB on repeat
// rides instead of re-hitting CARTO over cellular. Idempotent — safe at import.
registerTileCacheProtocol();

const CARTO_DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      // Note: CARTO documents a `{r}` retina token, but that's a Leaflet
      // convention MapLibre does not substitute — it would be sent literally
      // and break the tiles. Request the @2x tiles directly instead (crisp on
      // mobile retina displays).
      //
      // Each URL is wrapped in the cache-backed protocol (toCachedTileUrl):
      // MapLibre substitutes {z}/{x}/{y} into the full string, then the
      // protocol handler serves the tile from IndexedDB if present or fetches
      // + persists it (75MB LRU) on a miss. This is also the single seam where
      // a future keyed provider's auth token/header could be injected per
      // request without touching the rest of the map init.
      tiles: [
        toCachedTileUrl('https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'),
        toCachedTileUrl('https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'),
        toCachedTileUrl('https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'),
        toCachedTileUrl('https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'),
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://carto.com/attributions" target="_blank">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      // CARTO's dark_all tiles are quite muted by default — the road lines
      // sit below the midtone, so positive raster-contrast crushes them
      // toward black instead of lifting them. Raising the brightness floor
      // lifts the dark road lines without blowing out the labels/water.
      paint: { 'raster-brightness-min': 0.1 },
    },
  ],
};

export function BlacktopMap({ initialDestination, onContextLost }: BlacktopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const { convoy } = useConvoyState();
  // If the overlay was opened without an explicit destination but the
  // rider's convoy has one set, auto-populate it so the map immediately
  // draws the route + any waypoints — instead of opening blank and making
  // them re-search what they already chose in the lobby.
  const fallbackDestination: MapDestination | null = convoy.destination
    ? { lat: convoy.destination.lat, lng: convoy.destination.lng, name: convoy.destination.name, address: convoy.destination.address }
    : null;
  const seededDestination = initialDestination ?? fallbackDestination;
  const [destination, setDestination] = useState<MapDestination | null>(seededDestination);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const { settings } = useSettings();
  const { rideState } = useActiveRide();
  const convoyMembers = useConvoyMembers();
  const waypointStops = useWaypointRouteStops();
  const mapPresentUserIds = useMapPresentUserIds();
  const speakingUsers = useSpeakingUsers();
  const memberMarkersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement }>>(new Map());

  // MapLibre's paint/marker colors are parsed by its own JS color parser, not
  // the browser's CSS engine, so `hsl(var(--accent))` never resolves there —
  // look up the literal HSL components for the selected accent instead.
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  // MapLibre's color parser requires comma-separated hsl(), not the modern
  // space-separated CSS syntax that Tailwind tokens use.
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  // Mirror the ride screen's speed-warning thresholds (raw mph).
  const speed = rideState.currentSpeed;
  const speedColorClass =
    speed >= settings.redSpeedThreshold
      ? 'text-destructive'
      : speed >= settings.amberSpeedThreshold
        ? 'text-warning'
        : 'text-foreground';

  // Reuses the ride's existing speed signal to pause radar animation when
  // the vehicle has been stationary - no separate motion detection needed.
  useRadarOverlay(map, speed);

  const userMarkerRef = useRef<Marker | null>(null);
  const headingRef = useRef<number | null>(null);
  const hasFollowedUserRef = useRef(false);
  const lastInteractionAtRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center = initialDestination
      ? [initialDestination.lng, initialDestination.lat]
      : [-0.1276, 51.5072];

    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_DARK_STYLE,
      center: center as [number, number],
      zoom: initialDestination ? 15 : 14,
      attributionControl: false,
    });

    instance.addControl(new maplibregl.AttributionControl({ compact: true }));
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    instance.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: false,
      }),
      'top-right',
    );

    // The heading-up auto-follow camera (below) fights any manual pan/zoom/
    // rotate the rider makes. Track the last manual gesture and have the
    // follow logic back off for LOCATE_RESUME_DELAY_MS after it.
    const markInteraction = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) lastInteractionAtRef.current = Date.now();
    };
    instance.on('dragstart', markInteraction);
    instance.on('zoomstart', markInteraction);
    instance.on('rotatestart', markInteraction);
    instance.on('pitchstart', markInteraction);

    // On some mobile GPUs the WebGL context can be reclaimed under memory
    // pressure, which otherwise leaves a permanently black canvas with no
    // way out. Surface a recoverable error instead of failing silently.
    instance.on('webglcontextlost', () => setContextLost(true));
    instance.on('webglcontextrestored', () => setContextLost(false));

    mapRef.current = instance;
    setMap(instance);

    return () => {
      // A corrupted GL/camera state can make teardown itself throw; if that
      // happens uncaught during an effect cleanup, React can leave this
      // component (and the full-screen overlay it's in) stuck on screen
      // instead of unmounting it, which presents as a black screen that
      // doesn't go away. Always clear our own refs/state regardless.
      try {
        instance.remove();
      } catch (err) {
        console.error('[BlacktopMap] Error removing map instance:', err);
      }
      mapRef.current = null;
      setMap(null);
    };
    // Mount once; the map instance is imperative after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Continuously watch the user's location + heading. The first fix auto-
  // centers the map on the user so they never have to tap the locate button,
  // and subsequent fixes rotate the map heading-up while moving.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    let countryResolved = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        // Some Android devices report non-finite (NaN/Infinity) coordinates
        // on a bad fix. Feeding that into MapLibre's camera poisons its
        // internal matrix and renders a permanently black canvas, so bail
        // out before touching any state or the map.
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
        setUserLocation(loc);

        // GPS heading is null when stationary or unsupported. Only update the
        // rotation when we have a real, finite heading and the user is
        // actually moving — otherwise the map spins unpredictably while
        // parked, or (worse) a non-finite value poisons the camera bearing.
        const heading = position.coords.heading;
        const speed = position.coords.speed ?? 0;
        if (heading != null && Number.isFinite(heading) && speed > 0.5) {
          headingRef.current = heading;
        }

        if (!countryResolved) {
          countryResolved = true;
          const code = await getCountryCode(loc.lat, loc.lng);
          if (code) setCountryCode(code);
        }

        const map = mapRef.current;
        if (!map) return;

        // First fix: auto-center on the user (unless we opened on a specific
        // destination). Subsequent fixes keep them in view + heading-up.
        if (!hasFollowedUserRef.current && !initialDestination) {
          hasFollowedUserRef.current = true;
          map.flyTo({
            center: [loc.lng, loc.lat],
            zoom: 16,
            bearing: safeBearing(headingRef.current, map),
            essential: true,
          });
        } else if (hasFollowedUserRef.current) {
          // Rider is mid-interaction (or just finished one) — let them look
          // around instead of yanking the camera back on this fix.
          if (Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS) return;
          map.easeTo({
            center: [loc.lng, loc.lat],
            bearing: safeBearing(headingRef.current, map),
            duration: 800,
            essential: true,
          });
        }
      },
      () => {
        // Location denied/unavailable — map still works, just stays at default center.
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // Only register the watcher once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render / move a marker for the user's current position so they're always
  // visible on the map, independent of the GeolocateControl.
  useEffect(() => {
    if (!map || !userLocation) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'blacktop-user-marker';
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '9999px';
      el.style.background = accentColor;
      el.style.border = '3px solid #ffffff';
      el.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4)';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [map, userLocation, accentColor]);

  useEffect(() => {
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, []);


  useEffect(() => {
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
      const marker = new maplibregl.Marker({ color: accentColor })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
      markerRef.current = marker;
      // Don't recenter on the destination — once the route is drawn we'll
      // zoom into the user's position (heading-up) instead.
    }
  }, [map, destination, accentColor]);

  // Show a marker for every convoy member (including self) who has chosen
  // Blacktop Maps and has a live GPS fix — colored by their accent color,
  // glowing while they're speaking in the voice channel.
  useEffect(() => {
    if (!map) return;

    // currentLat/currentLng come from another rider's device via the
    // database/realtime, not our own validated watchPosition — a glitchy
    // fix from their GPS (the same non-finite-value issue fixed above) would
    // poison the shared map's camera matrix for everyone viewing it, so it
    // needs the same finite check here.
    const visibleMembers = convoyMembers.filter(
      (m): m is typeof m & { currentLat: number; currentLng: number } =>
        mapPresentUserIds.has(m.userId) &&
        typeof m.currentLat === 'number' &&
        Number.isFinite(m.currentLat) &&
        typeof m.currentLng === 'number' &&
        Number.isFinite(m.currentLng),
    );
    const visibleIds = new Set(visibleMembers.map((m) => m.userId));

    memberMarkersRef.current.forEach((entry, userId) => {
      if (!visibleIds.has(userId)) {
        entry.marker.remove();
        memberMarkersRef.current.delete(userId);
      }
    });

    visibleMembers.forEach((member) => {
      const colorStyles = getMemberColorStyles(member.accentColor);
      const isSpeaking = speakingUsers.has(member.userId);
      let entry = memberMarkersRef.current.get(member.userId);

      if (!entry) {
        const el = createMemberMarkerElement();
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([member.currentLng, member.currentLat])
          .addTo(map);
        entry = { marker, el };
        memberMarkersRef.current.set(member.userId, entry);
      } else {
        entry.marker.setLngLat([member.currentLng, member.currentLat]);
      }

      applyMemberMarkerStyle(entry.el, member.name, colorStyles, isSpeaking);
    });
  }, [map, convoyMembers, mapPresentUserIds, speakingUsers]);

  // Remove any remaining member markers when the map unmounts. The ref itself
  // is never reassigned, so reading .current in the cleanup is safe.
  useEffect(() => {
    const markers = memberMarkersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
    };
  }, []);

  // Fetch a driving route whenever both a destination and the user's location
  // are known, threading through any convoy waypoints in between. The
  // waypoint stops only ever arrive as bare {lat,lng} (from the DB fetch or
  // the lightweight Realtime broadcast) - this client fetches its own
  // routing geometry locally rather than trusting precomputed geometry off
  // the wire. A stale-guard id discards out-of-order responses.
  const routeRequestRef = useRef(0);
  useEffect(() => {
    if (!destination || !userLocation || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
      setRoute(null);
      setIsRouting(false);
      return;
    }

    const stops = [userLocation, ...waypointStops, { lat: destination.lat, lng: destination.lng }];

    const requestId = ++routeRequestRef.current;
    setIsRouting(true);
    fetchRouteThroughStops(stops)
      .then((result) => {
        if (routeRequestRef.current === requestId) setRoute(result);
      })
      .finally(() => {
        if (routeRequestRef.current === requestId) setIsRouting(false);
      });
  }, [destination, userLocation, waypointStops]);

  // Draw / update the route line and fit the camera to it.
  useEffect(() => {
    if (!map) return;

    const removeRouteLayers = () => {
      if (map.getLayer(ROUTE_LINE_LAYER_ID)) map.removeLayer(ROUTE_LINE_LAYER_ID);
      if (map.getLayer(ROUTE_CASING_LAYER_ID)) map.removeLayer(ROUTE_CASING_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    };

    if (!route) {
      removeRouteLayers();
      return;
    }

    const feature = {
      type: 'Feature' as const,
      geometry: route.geometry,
      properties: {},
    };

    const draw = () => {
      const existing = map.getSource(ROUTE_SOURCE_ID);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(feature);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: feature });
        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#000000', 'line-opacity': 0.5, 'line-width': 8 },
        });
        map.addLayer({
          id: ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': accentColor, 'line-width': 4 },
        });
      }

      // Zoom into the user (heading-up) once the route is drawn instead of
      // fitting the whole route — keeps focus on what's immediately ahead.
      // Skip it if the rider is mid-interaction so this doesn't yank the
      // camera away from wherever they're currently looking.
      const recentlyInteracted = Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS;
      if (userLocation && !recentlyInteracted) {
        map.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 17,
          bearing: safeBearing(headingRef.current, map),
          essential: true,
        });
      }
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once('load', draw);
    }

    return removeRouteLayers;
  }, [map, route, accentColor]);

  if (contextLost) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background">
        <button
          onClick={closeBlacktopMap}
          className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-card border border-border text-sm text-muted-foreground"
        >
          <span className="font-medium text-foreground">Map display lost</span>
          Tap to close and reopen the map
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="blacktop-maplibre absolute inset-0 w-full h-full" />

      <MapSearchBar
        map={map}
        userLocation={userLocation}
        countryCode={countryCode}
        onSelect={(result) => {
          setDestination({ lat: result.lat, lng: result.lng, name: result.name, address: result.address });

          // Transport the camera to the new destination immediately, rather
          // than waiting on the route fetch - critical for far-off picks
          // (different city/region) where the rider needs to see where the
          // map just jumped to. Fit both points when we know the rider's
          // location so the new route's full span is visible at once.
          if (map) {
            if (userLocation) {
              const bounds = new maplibregl.LngLatBounds(
                [userLocation.lng, userLocation.lat],
                [userLocation.lng, userLocation.lat],
              );
              bounds.extend([result.lng, result.lat]);
              map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1500 });
            } else {
              map.flyTo({ center: [result.lng, result.lat], zoom: 13, essential: true });
            }
          }
        }}
      />

      <div className="absolute bottom-3 left-3 right-3 z-10 space-y-1.5">
        {destination && (isRouting || route) && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/95 border border-border shadow-2xl backdrop-blur animate-slide-up">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{destination.name || 'Destination'}</p>
              {isRouting ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Finding route...
                </p>
              ) : route ? (
                <p className="text-xs text-muted-foreground">
                  {formatDistance(metersToMiles(route.distanceMeters), settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
                  {' · '}
                  {formatDuration(Math.round(route.durationSeconds))}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 items-end">
          <div className="justify-self-start px-2 py-0.5 text-[10px] text-muted-foreground/70 pointer-events-none">
            Weather: RainViewer
          </div>

          <div className="justify-self-center">
            {rideState.isActive && (
              <div
                className={cn(
                  'flex items-baseline gap-1.5 px-5 py-3 rounded-2xl bg-card/95 border border-border shadow-lg backdrop-blur font-mono font-bold tabular-nums transition-colors',
                  speedColorClass,
                )}
              >
                <span className="text-5xl leading-none">{formatSpeed(rideState.currentSpeed, settings.speedUnit)}</span>
                <span className="text-sm opacity-70">{getSpeedLabel(settings.speedUnit)}</span>
              </div>
            )}
          </div>

          <span />
        </div>
      </div>
    </div>
  );
}
