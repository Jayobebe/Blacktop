import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './blacktopMap.css';
import { closeBlacktopMap } from '../hooks/useMapOverlay';
import { useRadarOverlay } from '../hooks/useRadarOverlay';
import { registerTileCacheProtocol, toCachedTileUrl } from '../lib/tileCache';
import { getCountryCode } from '../lib/placeSearch';
import { fetchRouteThroughStops, metersToMiles, RouteResult } from '../lib/routing';
import { useNextWaypoint } from '@/features/waypoints';
import { MapSearchBar } from './MapSearchBar';
import { MapDestination } from '../types';
import { savePOI } from '../lib/poiStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BookmarkPlus } from 'lucide-react';
import { useMapPresentUserIds } from '../hooks/useMapPresence';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { useActiveRide, useSoloRoute, addSoloStop, removeSoloStopAt } from '@/features/ride';
import { useConvoyMembers, useConvoyState } from '@/features/convoy';
import { useSpeakingUsers } from '@/features/voice';
import { getMemberColorStyles } from '@/lib/memberColors';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Navigation, Loader2, SkipForward, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWaypoints } from '@/features/waypoints';

// How long the home map (no active ride) can stay idle before auto-closing.
const HOME_MAP_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

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

const LOCATE_RESUME_DELAY_MS = 10000;

interface BlacktopMapProps {
  initialDestination?: MapDestination | null;
  onContextLost?: () => void;
  isVisible?: boolean;
}

registerTileCacheProtocol();

const CARTO_DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
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
      paint: { 'raster-brightness-min': 0.1 },
    },
  ],
};

export function BlacktopMap({ initialDestination, onContextLost, isVisible }: BlacktopMapProps) {
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
  const [geoSpeed, setGeoSpeed] = useState<number>(0); // speed from geolocation (home map)
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [showSaveUI, setShowSaveUI] = useState(false);
  const [saveName, setSaveName] = useState('');
  const { settings } = useSettings();
  const { rideState } = useActiveRide();
  const convoyMembers = useConvoyMembers();
  const nextWaypoint = useNextWaypoint();
  const { waypoints, addWaypoint, removeWaypoint, completeWaypoint } = useWaypoints(convoy.id, convoy.isLeader);
  const soloRoute = useSoloRoute();
  const isSolo = !convoy.id;
  const [addingWaypoint, setAddingWaypoint] = useState(false);

  const mapPresentUserIds = useMapPresentUserIds();
  const speakingUsers = useSpeakingUsers();
  const memberMarkersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement }>>(new Map());

  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  // During an active ride use rideState speed; on the home map use raw geolocation speed.
  const displaySpeed = rideState.isActive ? rideState.currentSpeed : geoSpeed;
  const speedColorClass =
    displaySpeed >= settings.redSpeedThreshold
      ? 'text-destructive'
      : displaySpeed >= settings.amberSpeedThreshold
        ? 'text-warning'
        : 'text-foreground';

  useRadarOverlay(map, displaySpeed);

  const userMarkerRef = useRef<Marker | null>(null);
  const headingRef = useRef<number | null>(null);
  const hasFollowedUserRef = useRef(false);
  const lastInteractionAtRef = useRef(Date.now());

  // ── Inactivity guardrail for the home map ──────────────────────────────────
  // When there is no active ride, auto-close the map after HOME_MAP_INACTIVITY_MS
  // of no user interaction. This prevents an unattended device from keeping
  // MapLibre running indefinitely and burning through battery / tile quota.
  useEffect(() => {
    if (rideState.isActive) return;
    if (!isVisible) return; // don't run timer while overlay is hidden

    // Reset the idle clock each time the map is revealed so the 5-min window
    // starts fresh on every open, not from the previous session.
    lastInteractionAtRef.current = Date.now();

    const check = setInterval(() => {
      if (Date.now() - lastInteractionAtRef.current >= HOME_MAP_INACTIVITY_MS) {
        toast.info('Map closed due to inactivity');
        closeBlacktopMap();
      }
    }, 30_000); // check every 30 s

    return () => clearInterval(check);
  }, [rideState.isActive, isVisible]);

  // ── Effective destination in convoy active ride ────────────────────────────
  // Override local destination state with the convoy's current next stop so the
  // map always reflects the live convoy state, even as waypoints are added or
  // completed mid-ride.
  useEffect(() => {
    if (!rideState.isActive || !rideState.isConvoyMode) return;

    if (nextWaypoint) {
      setDestination({ lat: nextWaypoint.lat, lng: nextWaypoint.lng, name: nextWaypoint.name });
    } else if (convoy.destination) {
      setDestination({
        lat: convoy.destination.lat,
        lng: convoy.destination.lng,
        name: convoy.destination.name,
      });
    }
  }, [nextWaypoint, convoy.destination, rideState.isActive, rideState.isConvoyMode]);

  // ── Sync local destination when overlay's destination changes ──────────────
  // BlacktopMapOverlay keeps this component mounted (hidden via CSS) across
  // open/close cycles, so local `destination` state otherwise survives a
  // ride ending. When the parent clears its destination (e.g. ride end calls
  // clearMapDestination), drop the local route too — unless we're currently
  // in an active ride, in which case the convoy/waypoint effect above owns it.
  useEffect(() => {
    if (rideState.isActive) return;
    setDestination(initialDestination ?? null);
    if (!initialDestination) setRoute(null);
  }, [initialDestination, rideState.isActive]);



  // ── Map init ───────────────────────────────────────────────────────────────
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

    const markInteraction = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) lastInteractionAtRef.current = Date.now();
    };
    instance.on('dragstart', markInteraction);
    instance.on('zoomstart', markInteraction);
    instance.on('rotatestart', markInteraction);
    instance.on('pitchstart', markInteraction);

    instance.on('webglcontextlost', () => {
      if (onContextLost) onContextLost();
      else setContextLost(true);
    });
    instance.on('webglcontextrestored', () => setContextLost(false));

    mapRef.current = instance;
    setMap(instance);

    return () => {
      try {
        instance.remove();
      } catch (err) {
        console.error('[BlacktopMap] Error removing map instance:', err);
      }
      mapRef.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the overlay transitions from hidden (display:none) to visible, the
  // map canvas has no layout dimensions. Calling resize() after a short delay
  // lets the browser apply the display change before MapLibre recalculates.
  useEffect(() => {
    if (!isVisible || !mapRef.current) return;
    const t = window.setTimeout(() => { mapRef.current?.resize(); }, 50);
    return () => clearTimeout(t);
  }, [isVisible]);

  // ── Geolocation watch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    let countryResolved = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
        setUserLocation(loc);

        // Track raw speed for the home-map display (m/s → mph).
        const rawSpeed = position.coords.speed;
        if (rawSpeed != null && Number.isFinite(rawSpeed) && !rideState.isActive) {
          setGeoSpeed(rawSpeed * 2.23694); // m/s to mph
        }

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

        if (!hasFollowedUserRef.current && !initialDestination) {
          hasFollowedUserRef.current = true;
          map.flyTo({
            center: [loc.lng, loc.lat],
            zoom: 16,
            bearing: safeBearing(headingRef.current, map),
            essential: true,
          });
        } else if (hasFollowedUserRef.current) {
          if (Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS) return;
          map.easeTo({
            center: [loc.lng, loc.lat],
            bearing: safeBearing(headingRef.current, map),
            duration: 800,
            essential: true,
          });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── User position marker ───────────────────────────────────────────────────
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

  // ── Destination marker ─────────────────────────────────────────────────────
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
    }
  }, [map, destination, accentColor]);

  // ── Convoy member markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

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

  useEffect(() => {
    const markers = memberMarkersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
    };
  }, []);

  // GPS fixes arrive ~1 Hz; throttle to at most once every 5s to avoid
  // hammering OSRM on every fix while still keeping the route reasonably fresh.
  const ROUTE_RECALC_INTERVAL_MS = 5000;
  const [routingLocation, setRoutingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const lastRoutingSampleAtRef = useRef(0);
  const pendingRoutingSampleRef = useRef<number | null>(null);
  useEffect(() => {
    if (!userLocation) return;
    const now = Date.now();
    const elapsed = now - lastRoutingSampleAtRef.current;
    if (elapsed >= ROUTE_RECALC_INTERVAL_MS) {
      lastRoutingSampleAtRef.current = now;
      setRoutingLocation(userLocation);
      return;
    }
    if (pendingRoutingSampleRef.current != null) return;
    pendingRoutingSampleRef.current = window.setTimeout(() => {
      pendingRoutingSampleRef.current = null;
      lastRoutingSampleAtRef.current = Date.now();
      setRoutingLocation(userLocation);
    }, ROUTE_RECALC_INTERVAL_MS - elapsed);
    return () => {
      if (pendingRoutingSampleRef.current != null) {
        clearTimeout(pendingRoutingSampleRef.current);
        pendingRoutingSampleRef.current = null;
      }
    };
  }, [userLocation]);

  const routeRequestRef = useRef(0);
  useEffect(() => {
    if (!destination || !routingLocation || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
      setRoute(null);
      setIsRouting(false);
      return;
    }

    // Solo: route through any user-added stops on the way to destination.
    const intermediate = isSolo
      ? soloRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      : [];
    const stops = [routingLocation, ...intermediate, { lat: destination.lat, lng: destination.lng }];

    const requestId = ++routeRequestRef.current;
    setIsRouting(true);
    fetchRouteThroughStops(stops)
      .then((result) => {
        if (routeRequestRef.current === requestId) setRoute(result);
      })
      .finally(() => {
        if (routeRequestRef.current === requestId) setIsRouting(false);
      });
  }, [destination, routingLocation, isSolo, soloRoute.stops]);


  // ── Route line drawing ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const removeRouteLayers = () => {
      // On unmount/remount (e.g. WebGL context-loss auto-refresh) the map
      // instance may already have been torn down — its internal style is
      // gone and getLayer/getSource throw. Guard with a style check and
      // swallow any teardown error so the cleanup never crashes React.
      try {
        if (!map.getStyle()) return;
        if (map.getLayer(ROUTE_LINE_LAYER_ID)) map.removeLayer(ROUTE_LINE_LAYER_ID);
        if (map.getLayer(ROUTE_CASING_LAYER_ID)) map.removeLayer(ROUTE_CASING_LAYER_ID);
        if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      } catch {
        // Map already removed — nothing to clean up.
      }
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

  // ── Derived display flags ──────────────────────────────────────────────────
  const showSearchBar = !(rideState.isConvoyMode && !convoy.isLeader);
  const canSkipWaypoint =
    rideState.isActive && rideState.isConvoyMode && convoy.isLeader && nextWaypoint != null;

  const incompleteWaypoints = waypoints.filter(w => !w.isCompleted);
  // Show waypoints panel in any convoy context, or in a solo ride when we
  // have a destination (so the rider can add/remove mid-ride stops).
  const showWaypointsPanel = !!convoy.id
    ? (incompleteWaypoints.length > 0 || convoy.isLeader)
    : (rideState.isActive && !!destination);


  if (contextLost) {
    // Fallback when no parent remount handler is wired up — show a passive
    // loader; the GL `webglcontextrestored` event will clear this.
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Refreshing map…
        </div>
      </div>
    );
  }


  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="blacktop-maplibre absolute inset-0 w-full h-full" />

      {showSearchBar && (
        <MapSearchBar
          map={map}
          userLocation={userLocation}
          countryCode={countryCode}
          onSelect={(result) => {
            if (addingWaypoint) {
              addWaypoint({ name: result.name, address: result.address || '', lat: result.lat, lng: result.lng });
              setAddingWaypoint(false);
              return;
            }
            setDestination({ lat: result.lat, lng: result.lng, name: result.name, address: result.address });
            lastInteractionAtRef.current = Date.now();

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
      )}

      <div className="absolute bottom-3 left-3 right-3 z-10 space-y-1.5">
        {/* Waypoints panel — convoy context: leaders can add/remove, members can see stops */}
        {showWaypointsPanel && (
          <div className="animate-slide-up">
            {addingWaypoint ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-card/95 border border-border rounded-xl shadow-xl backdrop-blur">
                <Plus className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <p className="flex-1 text-xs text-accent">Search for a stop above…</p>
                <button
                  onClick={() => setAddingWaypoint(false)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  aria-label="Cancel adding stop"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-3 px-3 pb-1">
                {incompleteWaypoints.map((wp, i) => (
                  <div
                    key={wp.id}
                    className="snap-start flex-shrink-0 w-44 flex items-center gap-2 px-3 py-2 bg-card/95 border border-border rounded-xl shadow-lg backdrop-blur text-sm"
                  >
                    <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="flex-1 truncate text-xs">{wp.name}</p>
                    {convoy.isLeader && (
                      <button
                        onClick={() => removeWaypoint(wp.id)}
                        className="p-1 hover:bg-muted rounded-full transition-colors flex-shrink-0"
                        aria-label={`Remove stop ${wp.name}`}
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
                {convoy.isLeader && incompleteWaypoints.length < 5 && (
                  <button
                    onClick={() => setAddingWaypoint(true)}
                    className="snap-start flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-card/95 border border-dashed border-accent/60 rounded-xl shadow-lg backdrop-blur text-xs text-accent hover:bg-accent/10 transition-colors"
                    aria-label="Add stop"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Stop
                  </button>
                )}
              </div>
            )}
          </div>
        )}


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

            {/* Leader-only: skip current waypoint and advance to the next stop */}
            {canSkipWaypoint && (
              <button
                onClick={async () => {
                  await completeWaypoint(nextWaypoint!.id);
                  toast.success('Stop skipped');
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted hover:bg-secondary text-xs font-medium text-muted-foreground transition-colors flex-shrink-0"
                title="Skip this stop and advance to the next"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 items-end">
          <div className="justify-self-start px-2 py-0.5 text-[10px] text-muted-foreground/70 pointer-events-none">
            Weather: RainViewer
          </div>

          <div className="justify-self-center">
            {/* Show speed for active ride OR home-map preview (never saved) */}
            {(rideState.isActive || geoSpeed > 0) && (
              <div
                className={cn(
                  'flex items-baseline gap-1.5 px-5 py-3 rounded-2xl bg-card/95 border border-border shadow-lg backdrop-blur font-mono font-bold tabular-nums transition-colors',
                  speedColorClass,
                )}
              >
                <span className="text-5xl leading-none">
                  {formatSpeed(displaySpeed, settings.speedUnit)}
                </span>
                <span className="text-sm opacity-70">{getSpeedLabel(settings.speedUnit)}</span>
              </div>
            )}
          </div>

          <span />
        </div>
      </div>

      {/* ── Save Location (Add POI) ──────────────────────────────────────────
          Sits at bottom-left, mirroring the overlay's exit button at bottom-right.
          Tapping prompts for a name, then saves the current GPS fix as a POI. */}
      <div className="absolute bottom-3 left-3 z-20">
        {showSaveUI ? (
          <div className="bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur p-3 space-y-2 animate-slide-up w-64">
            <p className="text-xs font-semibold text-foreground">Name this spot</p>
            <Input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Home, Camp spot…"
              className="h-9 text-sm bg-background/60"
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveName.trim() && userLocation) {
                  savePOI({ name: saveName.trim(), lat: userLocation.lat, lng: userLocation.lng });
                  toast.success(`"${saveName.trim()}" saved`);
                  setSaveName('');
                  setShowSaveUI(false);
                }
                if (e.key === 'Escape') {
                  setSaveName('');
                  setShowSaveUI(false);
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!saveName.trim() || !userLocation}
                onClick={() => {
                  if (!saveName.trim() || !userLocation) return;
                  savePOI({ name: saveName.trim(), lat: userLocation.lat, lng: userLocation.lng });
                  toast.success(`"${saveName.trim()}" saved`);
                  setSaveName('');
                  setShowSaveUI(false);
                }}
                className="flex-1 h-8 text-xs"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSaveName(''); setShowSaveUI(false); }}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              if (!userLocation) {
                toast.info('Waiting for GPS fix…');
                return;
              }
              setSaveName('');
              setShowSaveUI(true);
            }}
            className="p-2.5 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors"
            aria-label="Save current location as a POI"
          >
            <BookmarkPlus className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
