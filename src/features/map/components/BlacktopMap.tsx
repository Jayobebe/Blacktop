import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './blacktopMap.css';
import { useRadarOverlay } from '../hooks/useRadarOverlay';
import { getCountryCode } from '../lib/placeSearch';
import { fetchRoute, metersToMiles, RouteResult } from '../lib/routing';
import { MapSearchBar } from './MapSearchBar';
import { MapDestination } from '../types';
import { useMapPresentUserIds } from '../hooks/useMapPresence';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { useActiveRide } from '@/features/ride';
import { useConvoyState } from '@/features/convoy';
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

// How long to hold off resuming GeolocateControl's auto-recenter after the
// rider manually pans/zooms the map, so a deliberate look-around isn't
// immediately snapped back to their position.
const LOCATE_RESUME_DELAY_MS = 10000;

interface BlacktopMapProps {
  initialDestination?: MapDestination | null;
}

const CARTO_DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      // Note: CARTO documents a `{r}` retina token, but that's a Leaflet
      // convention MapLibre does not substitute — it would be sent literally
      // and break the tiles. Request the @2x tiles directly instead (crisp on
      // mobile retina displays).
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
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

export function BlacktopMap({ initialDestination }: BlacktopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [destination, setDestination] = useState<MapDestination | null>(initialDestination ?? null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const { settings } = useSettings();
  const { rideState } = useActiveRide();
  const { convoy } = useConvoyState();
  const mapPresentUserIds = useMapPresentUserIds();
  const speakingUsers = useSpeakingUsers();
  const memberMarkersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement }>>(new Map());

  // MapLibre's paint/marker colors are parsed by its own JS color parser, not
  // the browser's CSS engine, so `hsl(var(--accent))` never resolves there —
  // look up the literal HSL components for the selected accent instead.
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl})`;

  // Mirror the ride screen's speed-warning thresholds (raw mph).
  const speed = rideState.currentSpeed;
  const speedColorClass =
    speed >= settings.redSpeedThreshold
      ? 'text-destructive'
      : speed >= settings.amberSpeedThreshold
        ? 'text-warning'
        : 'text-foreground';

  useRadarOverlay(map);

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
    instance.addControl(new maplibregl.NavigationControl(), 'top-right');

    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: false,
    });
    instance.addControl(geolocateControl, 'top-right');

    // GeolocateControl re-centers (and re-zooms) on the rider on every GPS
    // fix once tracking is active, which fights any manual pan/zoom — a
    // zoom gesture in particular doesn't drop it out of tracking mode the
    // way a drag does. Pause tracking on any rider-initiated map gesture and
    // only resume it after LOCATE_RESUME_DELAY_MS of no further interaction.
    let isTrackingUser = false;
    let isPausedByInteraction = false;
    let suppressNextTrackingEvent = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    geolocateControl.on('trackuserlocationstart', () => {
      if (suppressNextTrackingEvent) {
        suppressNextTrackingEvent = false;
        return;
      }
      isTrackingUser = true;
    });
    geolocateControl.on('trackuserlocationend', () => {
      if (suppressNextTrackingEvent) {
        suppressNextTrackingEvent = false;
        return;
      }
      isTrackingUser = false;
      isPausedByInteraction = false;
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    });

    const handleUserGesture = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent || !isTrackingUser) return;

      if (resumeTimer) clearTimeout(resumeTimer);

      if (!isPausedByInteraction) {
        isPausedByInteraction = true;
        suppressNextTrackingEvent = true;
        geolocateControl.trigger(); // ACTIVE_LOCK -> OFF: stop auto-recentering.
      }

      resumeTimer = setTimeout(() => {
        isPausedByInteraction = false;
        suppressNextTrackingEvent = true;
        geolocateControl.trigger(); // OFF -> WAITING_ACTIVE: resumes on the next GPS fix.
        resumeTimer = null;
      }, LOCATE_RESUME_DELAY_MS);
    };

    instance.on('dragstart', handleUserGesture);
    instance.on('zoomstart', handleUserGesture);
    instance.on('rotatestart', handleUserGesture);
    instance.on('pitchstart', handleUserGesture);

    mapRef.current = instance;
    setMap(instance);

    return () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      instance.remove();
      mapRef.current = null;
      setMap(null);
    };
    // Mount once; the map instance is imperative after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(loc);
        const code = await getCountryCode(loc.lat, loc.lng);
        if (code) setCountryCode(code);
        if (!initialDestination && mapRef.current) {
          mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
        }
      },
      () => {
        // Location denied/unavailable — map still works, just stays at default center.
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
    // Only fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (destination) {
      const marker = new maplibregl.Marker({ color: accentColor })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
      markerRef.current = marker;
      map.flyTo({ center: [destination.lng, destination.lat], zoom: 15 });
    }
  }, [map, destination, accentColor]);

  // Show a marker for every convoy member (including self) who has chosen
  // Blacktop Maps and has a live GPS fix — colored by their accent color,
  // glowing while they're speaking in the voice channel.
  useEffect(() => {
    if (!map) return;

    const visibleMembers = convoy.members.filter(
      (m): m is typeof m & { currentLat: number; currentLng: number } =>
        mapPresentUserIds.has(m.userId) && typeof m.currentLat === 'number' && typeof m.currentLng === 'number',
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
  }, [map, convoy.members, mapPresentUserIds, speakingUsers]);

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
  // are known. A stale-guard id discards out-of-order responses.
  const routeRequestRef = useRef(0);
  useEffect(() => {
    if (!destination || !userLocation) {
      setRoute(null);
      setIsRouting(false);
      return;
    }

    const requestId = ++routeRequestRef.current;
    setIsRouting(true);
    fetchRoute(userLocation, { lat: destination.lat, lng: destination.lng })
      .then((result) => {
        if (routeRequestRef.current === requestId) setRoute(result);
      })
      .finally(() => {
        if (routeRequestRef.current === requestId) setIsRouting(false);
      });
  }, [destination, userLocation]);

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

      const bounds = new maplibregl.LngLatBounds();
      route.geometry.coordinates.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: { top: 120, bottom: 120, left: 60, right: 60 }, maxZoom: 15 });
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once('load', draw);
    }

    return removeRouteLayers;
  }, [map, route, accentColor]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="blacktop-maplibre absolute inset-0 w-full h-full" />

      <MapSearchBar
        userLocation={userLocation}
        countryCode={countryCode}
        onSelect={(result) => setDestination({ lat: result.lat, lng: result.lng, name: result.name, address: result.address })}
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
