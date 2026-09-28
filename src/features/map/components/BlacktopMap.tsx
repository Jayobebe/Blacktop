import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./blacktopMap.css";
import { closeBlacktopMap, clearMapDestination, setBlacktopMapReady } from "../hooks/useMapOverlay";
import { useRadarOverlay } from "../hooks/useRadarOverlay";
import { registerTileCacheProtocol, toCachedTileUrl } from "../lib/tileCache";
import { calculateDistance, getCountryCode, getRecentLocations, type MapSearchResult } from "../lib/placeSearch";
import {
  fetchTrafficCameras,
  fetchCamerasOnRoute,
  metersBetween,
  CAMERA_MIN_ZOOM,
  TrafficCamera,
} from "../lib/cameraStore";
import { pingSpeedCamera, pingAnprCamera } from "../lib/cameraPing";
import { fetchRouteThroughStops, metersToMiles, RouteResult } from "../lib/routing";
import { checkRouteWeather, findDryRoute, HEAVY_MM } from "../lib/weatherRoute";
import { RadioButton } from "@/features/radio";
import { useNextWaypoint } from "@/features/waypoints";
import { MapSearchBar } from "./MapSearchBar";
import { LoopPlannerPanel } from "./LoopPlannerPanel";
import { OfflinePacksPanel } from "./OfflinePacksPanel";
import { TurnBanner } from "./TurnBanner";
import { whenStyleReady } from "../lib/whenStyleReady";
import { useTurnByTurn } from "../hooks/useTurnByTurn";
import { remainingLine } from "../lib/navigation";
import { stopSpeaking } from "../lib/speech";
import { MapDestination } from "../types";
import { deletePOI, getSavedPOIs, savePOI } from "../lib/poiStore";
import { loadDarkMapStyle } from "../lib/darkStyle";
import { getLastView, saveLastView } from "../lib/lastView";
import { addPinLayers, setMyPins, setPinsVisible, type PinInfo } from "../lib/mapPins";
import {
  addHazardLayer,
  fetchHazards,
  HazardBanner,
  HazardCard,
  HazardReport,
  pushHazardFix,
  setHazardData,
  useHazards,
  useHazardWarning,
} from "@/features/hazards";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookmarkPlus, Trash2 } from "lucide-react";
import { useMapPresentUserIds } from "../hooks/useMapPresence";
import { ACCENT_COLORS, useSettings } from "@/features/settings";
import { useProfile } from "@/features/profile";

import {
  useActiveRide,
  recordBadges,
  useSoloRoute,
  addSoloStop,
  removeSoloStopAt,
  clearSoloRoute,
  setSoloRoute,
} from "@/features/ride";
import { useConvoyMembers, useConvoyState, ConvoyStatusBar } from "@/features/convoy";
import { useProximityState, MergeBadge, HandshakeButton, getMergeControls, ALERT_RADIUS_M } from "@/features/proximity";
import { useSpeakingUsers } from "@/features/voice";
import { getMemberColorStyles } from "@/lib/memberColors";
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Navigation,
  Loader2,
  SkipForward,
  Plus,
  X,
  Flag,
  Map as MapIcon,
  Satellite,
  Box,
  AlertTriangle,
  Repeat,
  Download,
  IdCard,
  Check,

} from "lucide-react";
import { toast } from "sonner";
import { useWaypoints } from "@/features/waypoints";

import { useRescueBridge } from "@/features/rescue";
import { useCardDrops, dropToPayload, COLLECT_RADIUS_M, type CardDrop } from "@/features/cards/hooks/useCardDrops";
import { useCollectedCards, useSpectreCards, useVehicleCards, TIER_STYLES, useCardKickbacks, TIER_LADDER } from "@/features/cards";
import { fetchCardPhoto } from "@/features/cards/lib/cardPhoto";
import { copyLedger } from "@/features/cards/lib/dropEconomy";
import {
  CHALLENGE_COUNTDOWN_MS,
  CHALLENGE_WIN_BADGES,
  DEVIATION_GRACE_MS,
  DEVIATION_LIMIT_M,
  distanceToRoute,
  formatChallengeTime,
  SETTER_STOP_ALLOWANCE_SEC,
  formatDelta,
  hasCrossedFinish,
  scoreAttempt,
} from "@/features/cards/lib/challenge";
import {
  clearChallengeRun,
  setPendingChallengeReceipt,
  startChallengeRun,
  updateChallengeRun,
  useChallengeRun,
  type ChallengeResult,
} from "@/lib/challengeRun";
import { uploadCardPhoto } from "@/features/cards/lib/cardPhoto";

// How long the home map (no active ride) can stay idle before auto-closing.
const HOME_MAP_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

function createMemberMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.borderRadius = "50%";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "13px";
  el.style.fontWeight = "700";
  el.style.fontFamily = "inherit";
  el.style.border = "2px solid transparent";
  el.style.transition = "box-shadow 150ms ease, transform 150ms ease";
  return el;
}

/**
 * What turn-by-turn calls a stop when announcing it. Points the app adds to
 * shape a route (twisty legs, loop points) are passed through silently (null).
 */
function announcedStopName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (/^(twisty leg|loop point \d+)$/i.test(n)) return null;
  if (/^loop finish$/i.test(n)) return "your start point";
  return n || "your stop";
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
  el.textContent = (name.trim()[0] || "?").toUpperCase();
  el.style.backgroundColor = colorStyles.bg;
  el.style.borderColor = colorStyles.border;
  el.style.color = colorStyles.text;
  el.style.boxShadow = isSpeaking ? colorStyles.glow : "none";
  el.style.transform = isSpeaking ? "scale(1.15)" : "scale(1)";
}

const ROUTE_SOURCE_ID = "blacktop-route";
const ROUTE_CASING_LAYER_ID = "blacktop-route-casing";
const ROUTE_LINE_LAYER_ID = "blacktop-route-line";
// Secondary "rescue" route — burn-orange, glowing, always drawn above the
// primary route/waypoint line so it can never be hidden by it.
const RESCUE_SOURCE_ID = "blacktop-rescue-route";
const RESCUE_GLOW_OUTER_LAYER_ID = "blacktop-rescue-glow-outer";
const RESCUE_GLOW_INNER_LAYER_ID = "blacktop-rescue-glow-inner";
const RESCUE_LINE_LAYER_ID = "blacktop-rescue-line";
const RESCUE_LAYER_IDS = [RESCUE_GLOW_OUTER_LAYER_ID, RESCUE_GLOW_INNER_LAYER_ID, RESCUE_LINE_LAYER_ID];
// Matches the Burn button colour (--burn: 15 85% 52%).
const RESCUE_COLOR = "hsl(15, 85%, 52%)";

function createRescueMarkerElement(name: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.alignItems = "center";
  el.style.pointerEvents = "none";
  el.innerHTML = `
    <div style="padding:2px 8px;border-radius:9999px;background:${RESCUE_COLOR};color:#fff;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 0 18px ${RESCUE_COLOR};">
      RESCUE · ${name.replace(/[<>&]/g, "")}
    </div>
    <div style="width:14px;height:14px;margin-top:3px;border-radius:50%;background:${RESCUE_COLOR};border:2px solid #fff;box-shadow:0 0 20px ${RESCUE_COLOR};"></div>
  `;
  return el;
}

const LOCATE_RESUME_DELAY_MS = 5000;
// Zoom level used to auto-follow the rider. We push in tighter when there's an
// active destination so the route + rider fill the screen without pinch-zoom.
const FOLLOW_ZOOM_WITH_DESTINATION = 17;
const FOLLOW_ZOOM_NO_DESTINATION = 16;

interface BlacktopMapProps {
  initialDestination?: MapDestination | null;
  onContextLost?: () => void;
  isVisible?: boolean;
}

registerTileCacheProtocol();

const SATELLITE_LAYER_ID = "esri-satellite-layer";
// Free, key-less global elevation tiles (Terrarium encoding, AWS Open Data) —
// same source the 3D ride flyover uses.
const TERRAIN_SOURCE_ID = "blacktop-dem";
const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const BUILDINGS_LAYER_ID = "blacktop-buildings-3d";
const THREE_D_PITCH = 60;
/** How fast the camera circles a tapped pin (degrees per second). */
const ORBIT_DEG_PER_S = 9;
const SATELLITE_SOURCE_ID = "esri-satellite";

// Dark basemap: OpenFreeMap's free dark vector style (no API key required,
// built on OpenMapTiles/OpenStreetMap). The satellite raster layer is merged
// in so we can toggle visibility without calling setStyle() (which would
// blow away dynamically added sources/layers like the route line).

const SATELLITE_SOURCE: StyleSpecification["sources"][string] = {
  type: "raster",
  tiles: [
    toCachedTileUrl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"),
  ],
  tileSize: 256,
  attribution:
    'Tiles © <a href="https://www.esri.com" target="_blank">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
};

// Last-resort style if the OpenFreeMap fetch fails: plain dark background so
// the map still renders (route line, markers, satellite toggle all work).
const FALLBACK_DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: { [SATELLITE_SOURCE_ID]: SATELLITE_SOURCE },
  layers: [
    { id: "dark-background", type: "background", paint: { "background-color": "#0a0a0a" } },
    {
      id: SATELLITE_LAYER_ID,
      type: "raster",
      source: SATELLITE_SOURCE_ID,
      layout: { visibility: "none" },
    },
  ],
};

let basemapStylePromise: Promise<StyleSpecification> | null = null;

function getBasemapStyle(): Promise<StyleSpecification> {
  if (!basemapStylePromise) {
    basemapStylePromise = loadDarkMapStyle()
      .then((style) => ({
        ...style,
        sources: { ...style.sources, [SATELLITE_SOURCE_ID]: SATELLITE_SOURCE },
        layers: [
          ...style.layers,
          {
            id: SATELLITE_LAYER_ID,
            type: "raster",
            source: SATELLITE_SOURCE_ID,
            layout: { visibility: "none" },
          } as StyleSpecification["layers"][number],
        ],
      }))
      .catch((err) => {
        console.error("[BlacktopMap] Falling back to plain dark basemap:", err);
        return FALLBACK_DARK_STYLE;
      });
  }
  return basemapStylePromise;
}

export function BlacktopMap({ initialDestination, onContextLost, isVisible }: BlacktopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // Orbiting a tapped pin: GPS follow holds off, and Back restores this camera.
  const orbitingRef = useRef(false);
  const preOrbitCameraRef = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const { convoy, clearDestination } = useConvoyState();
  // If the overlay was opened without an explicit destination but the
  // rider's convoy has one set, auto-populate it so the map immediately
  // draws the route + any waypoints — instead of opening blank and making
  // them re-search what they already chose in the lobby.
  const fallbackDestination: MapDestination | null = convoy.destination
    ? {
        lat: convoy.destination.lat,
        lng: convoy.destination.lng,
        name: convoy.destination.name,
        address: convoy.destination.address,
      }
    : null;
  const seededDestination = initialDestination ?? fallbackDestination;
  const [destination, setDestination] = useState<MapDestination | null>(seededDestination);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoSpeed, setGeoSpeed] = useState<number>(0); // speed from geolocation (home map)
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  // Weather-avoidance detour via point, applied on top of the rider's own stops.
  const [weatherVia, setWeatherVia] = useState<{ lat: number; lng: number } | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [showSaveUI, setShowSaveUI] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [basemap, setBasemap] = useState<"dark" | "satellite">("dark");
  const [threeD, setThreeD] = useState(false);
  const { settings } = useSettings();
  const { user, profile } = useProfile();
  const { rideState, startRide, endRide } = useActiveRide();
  // Read from the long-lived GPS callback (it's bound once).
  const rideActiveRef = useRef(rideState.isActive);
  rideActiveRef.current = rideState.isActive;
  const convoyMembers = useConvoyMembers();
  const nextWaypoint = useNextWaypoint();
  const { waypoints, addWaypoint, removeWaypoint, completeWaypoint } = useWaypoints(convoy.id, convoy.isLeader);
  const soloRoute = useSoloRoute();
  const isSolo = !convoy.id;
  const [showLoopPlanner, setShowLoopPlanner] = useState(false);
  const [showOfflinePacks, setShowOfflinePacks] = useState(false);
  const [addingWaypoint, setAddingWaypoint] = useState(false);


  const rescue = useRescueBridge();
  const [rescueRoute, setRescueRoute] = useState<RouteResult | null>(null);
  const rescueMarkerRef = useRef<Marker | null>(null);

  const mapPresentUserIds = useMapPresentUserIds();
  const speakingUsers = useSpeakingUsers();
  const memberMarkersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement }>>(new Map());

  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(", ")})`;

  // During an active ride use rideState speed; on the home map use raw geolocation speed.
  const displaySpeed = rideState.isActive ? rideState.currentSpeed : geoSpeed;
  const speedColorClass =
    displaySpeed >= settings.redSpeedThreshold
      ? "text-destructive"
      : displaySpeed >= settings.amberSpeedThreshold
        ? "text-warning"
        : "text-foreground";

  useRadarOverlay(map, displaySpeed, settings.weatherOverlayEnabled);

  const userMarkerRef = useRef<Marker | null>(null);
  const headingRef = useRef<number | null>(null);
  // Mirrors the 3D toggle so the follow-camera calls (which live in effects with
  // stable deps) can keep the chase pitch instead of flattening the map.
  const threeDRef = useRef(false);
  const hasFollowedUserRef = useRef(false);
  const lastInteractionAtRef = useRef(Date.now());
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  const destinationRef = useRef<MapDestination | null>(seededDestination);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

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
      // Navigating on the home map counts as using it.
      if (guidingRef.current) lastInteractionAtRef.current = Date.now();
      if (Date.now() - lastInteractionAtRef.current >= HOME_MAP_INACTIVITY_MS) {
        toast.info("Map closed due to inactivity");
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

    // Open where the rider last was (not London, then a long pan); London only on a first ever open.
    const last = getLastView();
    const center = initialDestination
      ? [initialDestination.lng, initialDestination.lat]
      : last
        ? [last.lng, last.lat]
        : [-0.1276, 51.5072];

    let cancelled = false;
    let instance: MapLibreMap | null = null;
    // Show the map (and its controls) even if the first full draw never comes:
    // offline, or a tile server down. Otherwise the loading screen would stay.
    const readyFallback = window.setTimeout(() => setBlacktopMapReady(true), 6000);

    getBasemapStyle().then((style) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      instance = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: center as [number, number],
        zoom: initialDestination ? 15 : last?.zoom ?? 14,
        attributionControl: false,
      });

      instance.addControl(new maplibregl.AttributionControl({ compact: true }));
      // Compass only turns with the bearing: with visualizePitch it also squashed in 3D as
      // the map tilted (orbiting a pin, 3D mode), which looked broken. Tilt has its own button.
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      instance.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          // Blacktop draws the rider's own marker; MapLibre's blue dot sat on top of it for good.
          showUserLocation: false,
          showAccuracyCircle: false,
        }),
        "top-right",
      );

      const markInteraction = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) lastInteractionAtRef.current = Date.now();
      };
      instance.on("dragstart", markInteraction);
      instance.on("zoomstart", markInteraction);
      instance.on("rotatestart", markInteraction);
      instance.on("pitchstart", markInteraction);

      instance.on("webglcontextlost", () => {
        if (onContextLost) onContextLost();
        else setContextLost(true);
      });
      instance.on("webglcontextrestored", () => setContextLost(false));
      instance.once("load", () => setBlacktopMapReady(true));

      mapRef.current = instance;
      setMap(instance);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(readyFallback);
      setBlacktopMapReady(false);
      const m = mapRef.current;
      if (!m) return;
      try {
        m.remove();
      } catch (err) {
        console.error("[BlacktopMap] Error removing map instance:", err);
      }
      mapRef.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle basemap layer visibility when the user flips the Dark/Satellite
  // switch. Kept as a layer toggle (rather than setStyle) so dynamically
  // added sources/layers like the route line survive the swap.
  //
  // Satellite imagery (Esri World Imagery) only has reliable global coverage
  // up to ~z18 — past that we get grey "Map data not yet available" tiles.
  // Cap max zoom while satellite is active and restore it when swapping back.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const SAT_MAX_ZOOM = 18;
    const DEFAULT_MAX_ZOOM = 22; // maplibre default
    const apply = () => {
      if (!m.getLayer(SATELLITE_LAYER_ID)) return;
      // Dark basemap layers = everything except the satellite raster and our
      // dynamically added overlays (route line etc. keep their visibility).
      const darkLayerIds = m
        .getStyle()
        .layers.map((l) => l.id)
        .filter((id) => id !== SATELLITE_LAYER_ID && !id.startsWith("blacktop-"));
      for (const id of darkLayerIds) {
        m.setLayoutProperty(id, "visibility", basemap === "dark" ? "visible" : "none");
      }
      m.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", basemap === "satellite" ? "visible" : "none");
      if (basemap === "satellite") {
        m.setMaxZoom(SAT_MAX_ZOOM);
        if (m.getZoom() > SAT_MAX_ZOOM) m.zoomTo(SAT_MAX_ZOOM, { duration: 250 });
      } else {
        m.setMaxZoom(DEFAULT_MAX_ZOOM);
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("styledata", apply);
  }, [basemap, map]);

  // ── 3D terrain + building extrusions ──────────────────────────────────────
  // Adds the same elevation DEM and extruded OSM buildings used by the ride
  // flyover, and tilts the camera into a third-person chase view. Layers are
  // prefixed "blacktop-" so the dark/satellite visibility swap leaves them be.
  useEffect(() => {
    threeDRef.current = threeD;
    const m = mapRef.current;
    if (!m) return;

    const apply = () => {
      try {
        if (threeD) {
          if (!m.getSource(TERRAIN_SOURCE_ID)) {
            m.addSource(TERRAIN_SOURCE_ID, {
              type: "raster-dem",
              tiles: [TERRAIN_TILES],
              tileSize: 256,
              encoding: "terrarium",
              maxzoom: 14,
              attribution:
                'Terrain © <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a>',
            });
          }
          m.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });

          if (!m.getLayer(BUILDINGS_LAYER_ID) && m.getSource("openmaptiles")) {
            m.addLayer({
              id: BUILDINGS_LAYER_ID,
              type: "fill-extrusion",
              source: "openmaptiles",
              "source-layer": "building",
              minzoom: 13,
              paint: {
                "fill-extrusion-color": "#2b2b31",
                "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                "fill-extrusion-opacity": 0.85,
              },
            });
          }
          if (m.getPitch() < THREE_D_PITCH - 1) {
            const loc = userLocationRef.current;
            m.easeTo({
              pitch: THREE_D_PITCH,
              ...(loc ? { center: [loc.lng, loc.lat] as [number, number] } : {}),
              bearing: safeBearing(headingRef.current, m),
              duration: 600,
              essential: true,
            });
          }
        } else {
          m.setTerrain(null);
          if (m.getLayer(BUILDINGS_LAYER_ID)) m.removeLayer(BUILDINGS_LAYER_ID);
          if (m.getPitch() > 1) m.easeTo({ pitch: 0, duration: 600, essential: true });
        }
      } catch (err) {
        console.warn("[BlacktopMap] 3D toggle failed:", err);
      }
    };

    if (m.isStyleLoaded()) apply();
    else m.once("styledata", apply);
  }, [threeD, map]);

  // When the overlay transitions from hidden (display:none) to visible, the
  // map canvas has no layout dimensions. Calling resize() after a short delay
  // lets the browser apply the display change before MapLibre recalculates.
  useEffect(() => {
    if (!isVisible || !mapRef.current) return;
    const t = window.setTimeout(() => {
      mapRef.current?.resize();
    }, 50);
    return () => clearTimeout(t);
  }, [isVisible]);

  // ── Geolocation watch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let countryResolved = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
        setUserLocation(loc);
        // Hazard warnings: the ride feeds them during a ride; the map does otherwise.
        if (!rideActiveRef.current) pushHazardFix({ ...loc, speed: position.coords.speed ?? null, t: position.timestamp || Date.now() });
        saveLastView({ ...loc, zoom: mapRef.current?.getZoom() ?? 14 }, !hasFollowedUserRef.current);

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
        if (orbitingRef.current) return; // looking round a pin: don't yank the camera away

        const hasDestination = !!destinationRef.current;
        const followZoom = hasDestination ? FOLLOW_ZOOM_WITH_DESTINATION : FOLLOW_ZOOM_NO_DESTINATION;

        if (!hasFollowedUserRef.current) {
          hasFollowedUserRef.current = true;
          map.flyTo({
            center: [loc.lng, loc.lat],
            zoom: followZoom,
            bearing: safeBearing(headingRef.current, map),
            pitch: threeDRef.current ? THREE_D_PITCH : 0,
            essential: true,
          });
        } else {
          if (Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS) return;
          // Re-snap to a tight follow zoom whenever we resume after the rider
          // stopped panning; only nudge zoom up (never yank them out).
          const currentZoom = map.getZoom();
          map.easeTo({
            center: [loc.lng, loc.lat],
            zoom: currentZoom < followZoom ? followZoom : currentZoom,
            bearing: safeBearing(headingRef.current, map),
            pitch: threeDRef.current ? THREE_D_PITCH : 0,
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

  // ── Inactivity auto-follow resume ─────────────────────────────────────────
  // Re-centres/re-orients on the rider LOCATE_RESUME_DELAY_MS after the last
  // touch interaction. GPS ticks alone aren't reliable (stationary rider, or a
  // stale watch during an active ride), so this timer drives the resume too.
  useEffect(() => {
    if (!map || !isVisible) return;

    const container = map.getCanvasContainer();
    const mark = () => {
      lastInteractionAtRef.current = Date.now();
    };
    container.addEventListener("touchstart", mark, { passive: true });
    container.addEventListener("mousedown", mark);
    container.addEventListener("wheel", mark, { passive: true });

    let resumed = true;
    const tick = setInterval(() => {
      const idleFor = Date.now() - lastInteractionAtRef.current;
      if (idleFor < LOCATE_RESUME_DELAY_MS) {
        resumed = false;
        return;
      }
      if (resumed) return;
      resumed = true;

      const loc = userLocationRef.current;
      if (!loc) return;
      const followZoom = destinationRef.current ? FOLLOW_ZOOM_WITH_DESTINATION : FOLLOW_ZOOM_NO_DESTINATION;
      const currentZoom = map.getZoom();
      map.easeTo({
        center: [loc.lng, loc.lat],
        zoom: currentZoom < followZoom ? followZoom : currentZoom,
        bearing: safeBearing(headingRef.current, map),
        pitch: threeDRef.current ? THREE_D_PITCH : 0,
        duration: 800,
        essential: true,
      });
    }, 1000);

    return () => {
      clearInterval(tick);
      container.removeEventListener("touchstart", mark);
      container.removeEventListener("mousedown", mark);
      container.removeEventListener("wheel", mark);
    };
  }, [map, isVisible]);

  // ── User position marker ───────────────────────────────────────────────────
  // The rider's own pin and its letter badge are ONE element driven solely by
  // `userLocation`, so they can never drift apart (previously the letter came
  // from the 2s convoy broadcast while the dot came from live GPS).

  useEffect(() => {
    if (!map || !userLocation) return;

    const letter = (profile.name?.trim()[0] || "?").toUpperCase();

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "blacktop-user-marker";
      el.style.width = "32px";
      el.style.height = "32px";
      el.style.borderRadius = "9999px";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "13px";
      el.style.fontWeight = "700";
      el.style.fontFamily = "inherit";
      el.style.color = "#ffffff";
      el.style.background = accentColor;
      el.style.border = "3px solid #ffffff";
      el.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.4)";
      el.textContent = letter;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
      // Own pin always sits above convoy member pins.
      userMarkerRef.current.getElement().parentElement?.style.setProperty("z-index", "5");
    } else {
      const el = userMarkerRef.current.getElement();
      el.textContent = letter;
      el.style.background = accentColor;
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [map, userLocation, accentColor, profile.name]);

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
        // Never draw a second pin for ourselves — our own live-GPS marker
        // already carries the letter badge.
        m.userId !== user?.id &&
        mapPresentUserIds.has(m.userId) &&
        typeof m.currentLat === "number" &&
        Number.isFinite(m.currentLat) &&
        typeof m.currentLng === "number" &&
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
  }, [map, convoyMembers, mapPresentUserIds, speakingUsers, user?.id]);

  useEffect(() => {
    const markers = memberMarkersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
    };
  }, []);

  // ── Traffic cameras (OSM: speed cameras + ANPR/surveillance poles) ───────
  const cameraMarkersRef = useRef<Marker[]>([]);
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);

  // Refetch the camera layer when the viewport settles; hidden below z13 and
  // when the setting is off (no queries fire in either case).
  useEffect(() => {
    if (!map) return;
    if (!settings.trafficCamerasEnabled) {
      setCameras([]);
      return;
    }

    let cancelled = false;
    let debounce: number | null = null;

    const refresh = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      if (zoom < CAMERA_MIN_ZOOM) {
        setCameras((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      void fetchTrafficCameras(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        zoom,
      ).then((data) => {
        if (!cancelled) setCameras(data);
      });
    };

    const scheduleRefresh = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(refresh, 800);
    };

    refresh();
    map.on("moveend", scheduleRefresh);
    return () => {
      cancelled = true;
      if (debounce != null) window.clearTimeout(debounce);
      map.off("moveend", scheduleRefresh);
    };
  }, [map, settings.trafficCamerasEnabled]);

  // Render camera markers as eye glyphs (red = speed, orange = ANPR/Flock).
  useEffect(() => {
    if (!map) return;

    cameraMarkersRef.current.forEach((m) => m.remove());
    cameraMarkersRef.current = [];

    cameras.forEach((cam) => {
      const color =
        cam.type === "speed"
          ? "hsl(var(--destructive))"
          : cam.type === "alpr"
            ? "hsl(var(--warning))"
            : "hsl(var(--muted-foreground))";
      const el = document.createElement("div");
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.filter = "drop-shadow(0 0 3px rgba(0,0,0,0.8))";
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
      el.title =
        cam.type === "speed"
          ? `Speed camera${cam.maxspeed ? ` (${cam.maxspeed})` : ""}`
          : cam.type === "alpr"
            ? "ANPR camera"
            : "Traffic surveillance";

      const marker = new maplibregl.Marker({ element: el }).setLngLat([cam.lng, cam.lat]).addTo(map);
      cameraMarkersRef.current.push(marker);
    });
  }, [map, cameras]);

  useEffect(() => {
    const markers = cameraMarkersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.length = 0;
    };
  }, []);

  // ── Camera alerts ────────────────────────────────────────────────────────
  // 1) One summary toast when a route is set (how many cams are on the route)
  // 2) A proximity toast the first time you come within 300m of each camera.
  const [routeCameras, setRouteCameras] = useState<TrafficCamera[]>([]);
  const alertedCamerasRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!settings.trafficCamerasEnabled || !route?.geometry?.coordinates?.length) {
      setRouteCameras([]);
      return;
    }
    let cancelled = false;
    void fetchCamerasOnRoute(route.geometry.coordinates).then((found) => {
      if (cancelled) return;
      setRouteCameras(found);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.trafficCamerasEnabled, route]);

  // Summary toast only when the destination changes (not on every reroute).
  const summarisedDestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!destination) {
      summarisedDestRef.current = null;
      alertedCamerasRef.current.clear();
      return;
    }
    const key = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    if (summarisedDestRef.current === key) return;
    if (!settings.trafficCamerasEnabled || routeCameras.length === 0) return;
    summarisedDestRef.current = key;
    alertedCamerasRef.current.clear();
    const speed = routeCameras.filter((c) => c.type === "speed").length;
    const anpr = routeCameras.length - speed;
    const parts = [speed > 0 ? `${speed} speed` : null, anpr > 0 ? `${anpr} ANPR` : null].filter(Boolean);
    toast.warning(`${routeCameras.length} camera${routeCameras.length === 1 ? "" : "s"} on this route`, {
      description: parts.join(" · "),
    });
  }, [destination, routeCameras, settings.trafficCamerasEnabled]);

  // Approach alerts + audible ping.
  // With a route: any camera on the route corridor within 400m.
  // Without a route: only cameras we're actually heading into — within 500m and
  // inside a ±50° cone of the current heading, so cameras behind or off to the
  // side stay silent.
  useEffect(() => {
    if (!settings.trafficCamerasEnabled || !userLocation) return;
    const onRoute = routeCameras.length > 0;
    const pool = onRoute ? routeCameras : cameras;
    const heading = headingRef.current;

    for (const cam of pool) {
      if (alertedCamerasRef.current.has(cam.id)) continue;
      const dist = metersBetween(userLocation, cam);
      if (dist > (onRoute ? 400 : 500)) continue;

      if (!onRoute) {
        if (heading == null) continue;
        const dLng = ((cam.lng - userLocation.lng) * Math.PI) / 180;
        const lat1 = (userLocation.lat * Math.PI) / 180;
        const lat2 = (cam.lat * Math.PI) / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        let delta = Math.abs(bearing - heading) % 360;
        if (delta > 180) delta = 360 - delta;
        if (delta > 50) continue;
      }

      alertedCamerasRef.current.add(cam.id);
      if (cam.type === "speed") pingSpeedCamera();
      else pingAnprCamera();
      toast.warning(
        cam.type === "speed"
          ? `Speed camera ahead${cam.maxspeed ? ` · ${cam.maxspeed}` : ""}`
          : cam.type === "alpr"
            ? "ANPR camera ahead"
            : "Surveillance camera ahead",
      );
    }
  }, [userLocation, routeCameras, cameras, settings.trafficCamerasEnabled]);

  // ── Card drops (Blacktop World trading cards planted on the map) ─────────
  const cardsEnabled = settings.blacktopWorldEnabled;
  const { drops, myDrops, collectDrop, placeDrop, pickUpDrop, setChallenge, recordAttempt } = useCardDrops(
    cardsEnabled ? userLocation : null,
  );
  const { addCard } = useCollectedCards();
  const { earnSpectre } = useSpectreCards();
  useCardKickbacks();
  const { cards } = useVehicleCards();
  const [selectedStack, setSelectedStack] = useState<CardDrop[] | null>(null);
  const selectedDrop = selectedStack?.length === 1 ? selectedStack[0] : null;
  const [droppingCard, setDroppingCard] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ lat: number; lng: number } | null>(null);
  const cardMarkersRef = useRef<Marker[]>([]);

  // Copy 0 is the one locked in the vault; planted copies number upward from 1.
  const placedCount = myDrops.length;
  const ledger = copyLedger(
    cards.map((c) => c.stats.totalRides),
    placedCount,
  );
  const canDropCard = cardsEnabled && !rideState.isActive && ledger.available > 0 && cards.length > 0;

  // Drops within ~55m of each other read as one hot-spot stack on the map.
  const cardStacks = useMemo(() => {
    const buckets = new Map<string, CardDrop[]>();
    for (const d of drops) {
      const key = `${d.lat.toFixed(3)}:${d.lng.toFixed(3)}`;
      const list = buckets.get(key);
      if (list) list.push(d);
      else buckets.set(key, [d]);
    }
    return Array.from(buckets.values());
  }, [drops]);

  // Landmark-style card markers — home map only, so ride navigation stays clean.
  useEffect(() => {
    cardMarkersRef.current.forEach((m) => m.remove());
    cardMarkersRef.current = [];
    if (!map || !cardsEnabled || rideState.isActive) return;

    cardStacks.forEach((stack) => {
      const head = stack[0];
      const count = stack.length;
      const allCollected = stack.every((d) => d.collected || d.isOwn);
      // Hot-spot heat: more cards stacked here, hotter the landmark reads.
      const heat = count >= 5 ? 3 : count >= 3 ? 2 : count >= 2 ? 1 : 0;
      const heatColor = ["", "hsl(45 93% 58%)", "hsl(25 95% 55%)", "hsl(0 84% 60%)"][heat];
      const edge = allCollected ? "hsl(142 71% 45%)" : heat ? heatColor : accentColor;
      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.width = count > 1 ? "34px" : "30px";
      el.style.height = count > 1 ? "42px" : "38px";
      el.style.borderRadius = "6px";
      el.style.cursor = "pointer";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.background = "linear-gradient(145deg, rgba(30,30,32,0.96), rgba(10,10,12,0.96))";
      el.style.border = `1.5px solid ${edge}`;
      el.style.boxShadow = allCollected
        ? "0 0 8px hsl(142 71% 45% / 0.6)"
        : heat
          ? `0 0 ${6 + heat * 4}px ${heatColor}`
          : "0 2px 8px rgba(0,0,0,0.7)";
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        count > 1 ? `Card hot-spot · ${count} cards` : `${head.ownerName}'s ${head.vehicleName} card`,
      );
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${edge}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h.01M11 15h2"/><circle cx="9" cy="10" r="2"/></svg>`;
      const badge = document.createElement("span");
      badge.textContent = allCollected ? "✓" : String(count);
      badge.style.cssText = `position:absolute;top:-6px;right:-6px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:${allCollected ? "hsl(142 71% 45%)" : heat ? heatColor : accentColor};color:#04140a;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;`;
      if (allCollected || count > 1) el.appendChild(badge);
      // Cards carrying a time attack get a stopwatch pip.
      if (stack.some((d) => d.challenge)) {
        const chip = document.createElement("span");
        chip.textContent = "⏱";
        chip.style.cssText = `position:absolute;bottom:-6px;left:-6px;width:16px;height:16px;border-radius:8px;background:${accentColor};color:#04140a;font-size:9px;display:flex;align-items:center;justify-content:center;`;
        el.appendChild(chip);
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedStack(stack);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([head.lng, head.lat])
        .addTo(map);
      cardMarkersRef.current.push(marker);
    });
  }, [map, cardStacks, cardsEnabled, rideState.isActive, accentColor]);





  useEffect(() => {
    const markers = cardMarkersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.length = 0;
    };
  }, []);

  // Plant a card: the drop lands exactly where the rider is standing.
  useEffect(() => {
    if (!droppingCard) return;
    if (!userLocation) {
      toast.error("Need your location to drop a card");
      setDroppingCard(false);
      return;
    }
    setPendingDrop({ lat: userLocation.lat, lng: userLocation.lng });
  }, [droppingCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDropCard = async (withChallenge = false) => {
    if (!pendingDrop) return;
    const card = cards[0];
    const spot = pendingDrop;
    setPendingDrop(null);
    setDroppingCard(false);
    if (!card) return;
    try {
      const photoPath = card.bike.photos?.hero ? await uploadCardPhoto(card.bike.id, card.bike.photos.hero) : null;
      const dropId = await placeDrop.mutateAsync({
        card,
        lat: spot.lat,
        lng: spot.lng,
        copyIndex: placedCount + 1,
        photoPath,
      });
      if (!withChallenge) {
        toast.success("Card dropped", { description: "Riders nearby can now scan it." });
        return;
      }
      startChallengeRun({
        mode: "setting",
        dropId,
        vehicleName: card.bike.name,
        ownerName: profile?.name || "Rider",
        tier: card.tier,
        start: spot,
        route: [],
        finish: null,
        targetSec: null,
        startsAt: null,
        offRouteSince: null,
        voided: false,
      });
      toast.success("Card dropped", { description: "Ready up when you want the clock to start." });
    } catch {
      toast.error("Couldn't drop that card");
    }
  };

  // ── Card challenges (time attack attached to a dropped card) ─────────────
  const challengeRun = useChallengeRun();
  const [challengeNow, setChallengeNow] = useState(Date.now());
  useEffect(() => {
    if (!challengeRun) return;
    const id = setInterval(() => setChallengeNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [challengeRun]);

  const challengeCountdown = challengeRun?.startsAt ? Math.ceil((challengeRun.startsAt - challengeNow) / 1000) : 0;
  const challengeElapsedSec = challengeRun?.startsAt ? Math.max(0, (challengeNow - challengeRun.startsAt) / 1000) : 0;

  /** Owner finishes setting a route: the current spot becomes the finish line. */
  const finishSettingChallenge = async () => {
    if (!challengeRun || challengeRun.mode !== "setting") return;
    if (!userLocation) {
      toast.error("Need your location to set the finish line");
      return;
    }
    const timeSec = Math.max(
      1,
      Math.round((Date.now() - (challengeRun.startsAt ?? Date.now())) / 1000) - SETTER_STOP_ALLOWANCE_SEC,
    );
    const route = rideState.gpsPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
    const finish = { lat: userLocation.lat, lng: userLocation.lng };
    try {
      await setChallenge.mutateAsync({
        dropId: challengeRun.dropId,
        route: route.length > 1 ? route : [challengeRun.start, finish],
        timeSec,
        distanceMi: rideState.distance,
        finish,
      });
      setPendingChallengeReceipt({
        dropId: challengeRun.dropId,
        vehicleName: challengeRun.vehicleName,
        ownerName: challengeRun.ownerName,
        tier: challengeRun.tier,
        role: "set",
        targetSec: null,
        timeSec,
        route,
      });
      toast.success("Challenge set", {
        description: `Time to beat: ${formatChallengeTime(timeSec)}`,
      });
    } catch {
      toast.error("Couldn't save that challenge");
    }
    clearChallengeRun();
    await endRide();
  };

  /** Challenger crosses the line (or gets voided). */
  const finalizeAttempt = async (result: ChallengeResult, timeSec: number) => {
    if (!challengeRun || challengeRun.mode !== "attempting") return;
    const run = challengeRun;
    clearChallengeRun();
    const prize = drops.find((d) => d.id === run.dropId);
    // Racing your own challenge earns your own Spectre card, but never badges
    // (they buy card copies, so an easy self-set challenge can't farm them).
    const ownChallenge = !!prize?.isOwn;
    if (!ownChallenge) {
      recordBadges(result === "won" ? Array(CHALLENGE_WIN_BADGES).fill("speed-demon") : ["fallback"]);
    }
    setPendingChallengeReceipt({
      dropId: run.dropId,
      vehicleName: run.vehicleName,
      ownerName: run.ownerName,
      tier: run.tier,
      role: "attempt",
      targetSec: run.targetSec,
      timeSec,
      result,
      route: run.route,
      own: ownChallenge,
    });
    recordAttempt.mutate({ dropId: run.dropId, timeSec, result });
    if (result === "won") {
      // Beating the setter earns the Spectre (ghost) version of their card.
      // The normal card is still only collected by scanning it.
      const card = prize
        ? dropToPayload(prize)
        : {
            v: 1 as const,
            i: run.dropId.replace(/-/g, ""),
            n: run.vehicleName,
            o: run.ownerName,
            t: (run.tier ?? "bronze") as CardDrop["tier"],
            tl: TIER_LADDER.find((t) => t.id === run.tier)?.label ?? "Bronze",
            s: { totalRides: 0, totalDistanceMi: 0, totalDurationSec: 0, topSpeedMph: 0, maxLean: 0, maxGForce: 0 },
            ts: Date.now(),
          };
      const img = card.p ? await fetchCardPhoto(card.p) : null;
      const outcome = earnSpectre({
        key: run.dropId,
        card,
        img: img ?? undefined,
        setterName: run.ownerName,
        timeSec,
        targetSec: run.targetSec ?? timeSec,
      });
      toast.success("Challenge beaten", {
        description: `${formatChallengeTime(timeSec)} · ${formatDelta(timeSec, run.targetSec ?? timeSec)}${ownChallenge ? "" : " · 3x Speed Demon"} · ${
          outcome === "new" ? "Spectre card unlocked" : outcome === "improved" ? "Spectre time improved" : "Spectre already yours"
        }`,
      });
    } else if (result === "void") {
      toast.error("Challenge voided", { description: `You strayed off the route.${ownChallenge ? "" : " 1x Fallback."}` });
    } else {
      toast("Challenge lost", {
        description: `${formatChallengeTime(timeSec)} vs ${formatChallengeTime(run.targetSec ?? 0)}${ownChallenge ? "" : " · 1x Fallback"}`,
      });
    }
    await endRide();
  };

  /** Start an attempt on a card's challenge — must be within pick-up range. */
  const takeChallenge = (drop: CardDrop) => {
    if (!drop.challenge) return;
    if (!userLocation || metersBetween(userLocation, drop) > COLLECT_RADIUS_M) {
      toast.error("Get closer to the card to take its challenge");
      return;
    }
    setSelectedStack(null);
    startChallengeRun({
      mode: "attempting",
      dropId: drop.id,
      vehicleName: drop.vehicleName,
      ownerName: drop.ownerName,
      tier: drop.tier,
      start: { lat: drop.lat, lng: drop.lng },
      route: drop.challenge.route,
      finish: drop.challenge.finish,
      targetSec: drop.challenge.timeSec,
      startsAt: Date.now() + CHALLENGE_COUNTDOWN_MS,
      offRouteSince: null,
      voided: false,
    });
    startRide(false);
  };

  // Live attempt policing: route deviation and finish-line detection.
  useEffect(() => {
    if (!challengeRun || challengeRun.mode !== "attempting" || !userLocation) return;
    if (!challengeRun.startsAt || Date.now() < challengeRun.startsAt) return;
    const here = { lat: userLocation.lat, lng: userLocation.lng };

    const off = distanceToRoute(here, challengeRun.route) > DEVIATION_LIMIT_M;
    if (off) {
      const since = challengeRun.offRouteSince ?? Date.now();
      if (challengeRun.offRouteSince == null) updateChallengeRun({ offRouteSince: since });
      if (Date.now() - since > DEVIATION_GRACE_MS) {
        void finalizeAttempt("void", (Date.now() - challengeRun.startsAt) / 1000);
        return;
      }
    } else if (challengeRun.offRouteSince != null) {
      updateChallengeRun({ offRouteSince: null });
    }

    // Ignore the finish line for the first few seconds when start and finish
    // sit close together (short loops), so the run can't instantly complete.
    const elapsed = (Date.now() - (challengeRun.startsAt ?? Date.now())) / 1000;
    if (elapsed > 5 && hasCrossedFinish(here, challengeRun.finish)) {
      void finalizeAttempt(scoreAttempt(elapsed, challengeRun.targetSec ?? elapsed, false), elapsed);
    }
  }, [challengeRun, userLocation, challengeNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nearby riders (opt-in): voice-range ring + faint rider dots ─────────
  const proximity = useProximityState();
  const proxMarkersRef = useRef<Map<string, Marker>>(new Map());

  // Ring = the radius other riders need to be within to be offered a join-up.
  useEffect(() => {
    if (!map) return;
    const SRC = "prox-range";
    const center = proximity.active ? userLocation : null;
    const ring: [number, number][] = [];
    if (center) {
      const dLat = ALERT_RADIUS_M / 111_320;
      const dLng = ALERT_RADIUS_M / (111_320 * Math.cos((center.lat * Math.PI) / 180));
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * 2 * Math.PI;
        ring.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
      }
    }
    const data = {
      type: "FeatureCollection" as const,
      features: ring.length
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }]
        : [],
    };
    const apply = () => {
      const existing = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        return;
      }
      if (!ring.length) return;
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({ id: `${SRC}-fill`, type: "fill", source: SRC, paint: { "fill-color": accentColor, "fill-opacity": 0.06 } });
      map.addLayer({
        id: `${SRC}-line`,
        type: "line",
        source: SRC,
        paint: { "line-color": accentColor, "line-width": 1.5, "line-opacity": 0.5, "line-dasharray": [2, 2] },
      });
    };
    return whenStyleReady(map, apply);
  }, [map, proximity.active, userLocation, accentColor]);

  // Gentle pulse on the ring while it's showing.
  useEffect(() => {
    if (!map || !proximity.active) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (!map.getLayer("prox-range-fill")) return;
      const t = (Date.now() - started) / 1000;
      map.setPaintProperty("prox-range-fill", "fill-opacity", 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2)));
    }, 150);
    return () => window.clearInterval(id);
  }, [map, proximity.active]);

  useEffect(() => {
    if (!map) return;
    const markers = proxMarkersRef.current;
    const ids = new Set(proximity.riders.map((r) => r.userId));
    markers.forEach((m, id) => {
      if (!ids.has(id)) {
        m.remove();
        markers.delete(id);
      }
    });
    for (const r of proximity.riders) {
      const label = `${r.name}${r.convoyId ? ` · ${r.convoyName ?? "convoy"}` : ""}`;
      let marker = markers.get(r.userId);
      if (!marker) {
        const el = document.createElement("div");
        el.style.cssText = `width:12px;height:12px;border-radius:9999px;background:${accentColor};opacity:0.45;box-shadow:0 0 10px ${accentColor};cursor:pointer;`;
        marker = new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map);
        markers.set(r.userId, marker);
      } else {
        marker.setLngLat([r.lng, r.lat]);
      }
      const el = marker.getElement();
      el.title = label;
      el.setAttribute("aria-label", `Nearby rider ${label}`);
    }
  }, [map, proximity.riders, accentColor]);

  useEffect(() => {
    const markers = proxMarkersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
    };
  }, []);

  // Draw the challenge route being raced.
  useEffect(() => {
    if (!map) return;
    const SRC = "challenge-route";
    const LAYER = "challenge-route-line";
    const coords =
      challengeRun && challengeRun.mode === "attempting" ? challengeRun.route.map((p) => [p.lng, p.lat]) : [];
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coords },
    };
    const apply = () => {
      const existing = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        return;
      }
      if (!coords.length) return;
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({
        id: LAYER,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accentColor, "line-width": 5, "line-opacity": 0.75, "line-dasharray": [2, 1] },
      });
    };
    return whenStyleReady(map, apply);
  }, [map, challengeRun, accentColor]);

  // Proximity ping while riding without a destination.
  const pingedDropsRef = useRef<Set<string>>(new Set());
  const cardPingMeters = settings.distanceUnit === "km" ? 10_000 : 16_093;
  useEffect(() => {
    if (!cardsEnabled || !userLocation) return;
    if (!rideState.isActive || destination) return;
    for (const drop of drops) {
      if (drop.collected || drop.isOwn) continue;
      if (pingedDropsRef.current.has(drop.id)) continue;
      if (metersBetween(userLocation, drop) > cardPingMeters) continue;
      pingedDropsRef.current.add(drop.id);
      pingAnprCamera();
      toast("Card nearby", {
        description: `${drop.ownerName}'s ${drop.vehicleName} — tap to go for it`,
        action: {
          label: "Go",
          onClick: () =>
            setDestination({
              lat: drop.lat,
              lng: drop.lng,
              name: `${drop.ownerName}'s card`,
            }),
        },
      });
    }
  }, [cardsEnabled, userLocation, drops, rideState.isActive, destination, cardPingMeters]);

  const handleCollectDrop = async (drop: CardDrop, silent = false) => {
    if (!userLocation) {
      toast.error("Need your location to scan this card");
      return false;
    }
    if (rideState.isActive && rideState.currentSpeed > 3) {
      toast.warning("Stop safely before scanning a card");
      return false;
    }
    try {
      const collected = await collectDrop.mutateAsync({
        dropId: drop.id,
        lat: userLocation.lat,
        lng: userLocation.lng,
      });
      addCard(dropToPayload(collected));
      if (!silent) {
        setSelectedStack(null);
        toast.success("Card collected", { description: "Added to your vault." });
      }
      return true;
    } catch {
      if (!silent) toast.error(`Get within ${COLLECT_RADIUS_M}m of the card to scan it`);
      return false;
    }
  };

  const handleCollectStack = async (stack: CardDrop[]) => {
    const targets = stack.filter((d) => !d.collected && !d.isOwn);
    let got = 0;
    for (const drop of targets) {
      // eslint-disable-next-line no-await-in-loop
      if (await handleCollectDrop(drop, true)) got += 1;
    }
    setSelectedStack(null);
    if (got > 0) {
      toast.success(`${got} card${got > 1 ? "s" : ""} collected`, {
        description: "Added to your vault.",
      });
    } else {
      toast.error(`Get within ${COLLECT_RADIUS_M}m of the hot-spot to scan these cards`);
    }
  };

  // Where the rescue route is drawn from. GPS fixes arrive ~1 Hz; the rescue
  // line only needs refreshing every 30 s as the rider closes in.
  const ROUTE_RECALC_INTERVAL_MS = 30000;
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

  // Moving: the search bar gets out of the way so the toolbar (and, in a
  // convoy, the status strip) can take its place. Comes back once slow or
  // stopped. Hysteresis + delays so it doesn't flap at junctions/lights.
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const MOVING_MPH = 12;
    const STOPPED_MPH = 5;
    if (!moving && displaySpeed >= MOVING_MPH) {
      const t = window.setTimeout(() => setMoving(true), 2000);
      return () => window.clearTimeout(t);
    }
    if (moving && displaySpeed <= STOPPED_MPH) {
      const t = window.setTimeout(() => setMoving(false), 4000);
      return () => window.clearTimeout(t);
    }
  }, [displaySpeed, moving]);

  // ── Pins: nearby places, saved places, visited recently ────────────────────
  const [pin, setPin] = useState<PinInfo | null>(null);
  useEffect(() => {
    if (!map) return;
    let removePins: (() => void) | null = null;
    const refreshMine = () => setMyPins(map, getSavedPOIs(), getRecentLocations());
    const cancel = whenStyleReady(map, () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      try {
        removePins = addPinLayers(map, raw ? `hsl(${raw.replace(/\s+/g, ", ")})` : "#f97316", (p) => {
          lastInteractionAtRef.current = Date.now();
          setPin(p);
        });
        refreshMine();
      } catch (err) {
        // Not loaded yet: let whenStyleReady retry. Anything else: no pins, but never a broken map.
        if (/not done loading/i.test(String((err as Error)?.message ?? err))) throw err;
        console.warn("[BlacktopMap] Pins unavailable:", err);
      }
    });
    window.addEventListener("blacktop-poi-saved", refreshMine);
    window.addEventListener("blacktop-recent-saved", refreshMine);
    return () => {
      cancel();
      removePins?.();
      window.removeEventListener("blacktop-poi-saved", refreshMine);
      window.removeEventListener("blacktop-recent-saved", refreshMine);
    };
  }, [map]);
  // Out of the way while riding, like the search bar.
  useEffect(() => {
    if (!map) return;
    const cancel = whenStyleReady(map, () => setPinsVisible(map, !moving));
    if (moving) {
      // Riding off: drop the pin card and hand the camera back to GPS follow.
      orbitingRef.current = false;
      preOrbitCameraRef.current = null;
      setPin(null);
    }
    return cancel;
  }, [map, moving]);

  // ── Hazards: reports on the map, tap for details ───────────────────────────
  const hazards = useHazards();
  const hazardWarning = useHazardWarning();
  const [hazardId, setHazardId] = useState<string | null>(null);
  const tappedHazard = hazardId ? hazards.find((h) => h.id === hazardId) ?? null : null;
  useEffect(() => {
    if (!map) return;
    let remove: (() => void) | null = null;
    const cancel = whenStyleReady(map, () => {
      try {
        remove = addHazardLayer(map, (id) => {
          lastInteractionAtRef.current = Date.now();
          setPin(null);
          setHazardId(id);
        });
      } catch (err) {
        if (/not done loading/i.test(String((err as Error)?.message ?? err))) throw err;
        console.warn("[BlacktopMap] Hazards unavailable:", err);
      }
    });
    // Load reports for what's on screen (the warning engine loads around the rider on its own).
    let last = 0;
    const load = () => {
      if (map.getZoom() < 9 || Date.now() - last < 10_000) return;
      last = Date.now();
      const b = map.getBounds();
      void fetchHazards({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    };
    map.on("moveend", load);
    load();
    return () => {
      cancel();
      remove?.();
      map.off("moveend", load);
    };
  }, [map]);
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => setHazardData(map, hazards));
  }, [map, hazards]);

  // Tapped pin: fly in, tilt to a third-person view and slowly circle it.
  // Touching the map stops the circling; Back / Navigate end the orbit.
  useEffect(() => {
    if (!map || !pin) return;
    if (!preOrbitCameraRef.current) {
      const c = map.getCenter();
      preOrbitCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    }
    orbitingRef.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    const spin = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      map.setBearing((map.getBearing() + dt * ORBIT_DEG_PER_S) % 360);
      raf = requestAnimationFrame(spin);
    };
    map.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 16.8), pitch: 60, duration: reduce ? 0 : 1200, essential: true });
    const startT = reduce ? 0 : window.setTimeout(() => (raf = requestAnimationFrame(spin)), 1250);
    const stopSpin = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return; // our own easeTo
      window.clearTimeout(startT);
      cancelAnimationFrame(raf);
    };
    const events = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;
    events.forEach((ev) => map.on(ev, stopSpin));
    return () => {
      window.clearTimeout(startT);
      cancelAnimationFrame(raf);
      events.forEach((ev) => map.off(ev, stopSpin));
    };
  }, [map, pin]);

  /** Leave the orbit: Back returns the camera to where it was; Navigate hands it to the route. */
  const exitOrbit = (restore: boolean) => {
    const saved = preOrbitCameraRef.current;
    preOrbitCameraRef.current = null;
    orbitingRef.current = false;
    setPin(null);
    lastInteractionAtRef.current = Date.now();
    if (!map) return;
    if (restore && saved) map.easeTo({ ...saved, duration: 900, essential: true });
    else map.easeTo({ pitch: threeDRef.current ? THREE_D_PITCH : 0, bearing: 0, duration: 600, essential: true });
  };

  // ── Route ──────────────────────────────────────────────────────────────────
  // Planned from where the rider is, then only re-planned when the stops change,
  // the rider leaves the line (useTurnByTurn asks) or a request failed.
  // Solo: through any user-added stops. A weather detour via (if the rider
  // accepted one) always goes first.
  const [rerouteTick, setRerouteTick] = useState(0);
  const [rerouting, setRerouting] = useState(false);
  const hasLocation = userLocation != null;
  const intermediateStops = useMemo(
    () => [
      ...(weatherVia ? [{ lat: weatherVia.lat, lng: weatherVia.lng, name: null as string | null }] : []),
      ...(isSolo ? soloRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng, name: announcedStopName(s.name) })) : []),
    ],
    [weatherVia, isSolo, soloRoute.stops],
  );
  const routeKey =
    destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
      ? JSON.stringify([destination.lat, destination.lng, intermediateStops.map((s) => [s.lat, s.lng])])
      : null;
  const routeKeyRef = useRef<string | null>(null);
  const routeRequestRef = useRef(0);
  useEffect(() => {
    if (!routeKey || !destination) {
      routeRequestRef.current += 1;
      routeKeyRef.current = null;
      setRoute(null);
      setIsRouting(false);
      setRerouting(false);
      return;
    }
    const from = userLocationRef.current;
    if (!from) return;

    // Same stops as the route on screen: this is a reroute, so keep the old
    // line up until the new one lands.
    const isReroute = routeKeyRef.current === routeKey;
    const requestId = ++routeRequestRef.current;
    if (isReroute) setRerouting(true);
    else setIsRouting(true);
    let retry: number | null = null;
    fetchRouteThroughStops(
      [from, ...intermediateStops.map(({ lat, lng }) => ({ lat, lng })), { lat: destination.lat, lng: destination.lng }],
      { steps: true },
    )
      .then((result) => {
        if (routeRequestRef.current !== requestId) return;
        if (result) {
          routeKeyRef.current = routeKey;
          setRoute(result);
        } else {
          if (!isReroute) setRoute(null);
          retry = window.setTimeout(() => setRerouteTick((t) => t + 1), 15000);
        }
      })
      .finally(() => {
        if (routeRequestRef.current === requestId) {
          setIsRouting(false);
          setRerouting(false);
        }
      });
    return () => {
      if (retry != null) window.clearTimeout(retry);
    };
    // intermediateStops and destination are captured through routeKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, hasLocation, rerouteTick]);

  // ── Turn-by-turn ───────────────────────────────────────────────────────────
  // Guidance starts as soon as there's a destination (search, a pin's
  // Navigate, a convoy stop), on the home map or in a ride: the turn banner
  // takes the top slot and shows "Finding route…" until the route arrives. It
  // stays up until the destination is cleared or the rider closes it.
  const [guiding, setGuiding] = useState(false);
  // The rider closed the banner: no guidance for this destination until they
  // tap Go again (a new destination starts fresh).
  const [navDismissed, setNavDismissed] = useState(false);
  useEffect(() => {
    setNavDismissed(false);
  }, [destination?.lat, destination?.lng]);
  useEffect(() => {
    if (!destination || navDismissed) {
      setGuiding(false);
      stopSpeaking();
      return;
    }
    setGuiding(true);
  }, [destination, navDismissed]);
  const guidingRef = useRef(false);
  guidingRef.current = guiding;

  const finalStopName = destination ? announcedStopName(destination.name) : null;
  const navStops = useMemo(
    () => [...intermediateStops.map((s) => s.name), finalStopName],
    [intermediateStops, finalStopName],
  );

  const handleStopReached = (index: number) => {
    const stop = intermediateStops[index];
    if (!stop) return;
    // Passed stops come off the plan so the next route doesn't lead back to them.
    if (weatherVia && index === 0) {
      setWeatherVia(null);
      return;
    }
    const soloIndex = index - (weatherVia ? 1 : 0);
    if (isSolo && soloIndex >= 0) {
      removeSoloStopAt(soloIndex);
      if (stop.name) toast.success(`Reached ${stop.name}`);
    }
  };

  const turnByTurn = useTurnByTurn({
    route,
    userLocation,
    speedMph: displaySpeed,
    active: guiding,
    voice: settings.navVoiceEnabled,
    unit: settings.distanceUnit,
    stops: navStops,
    onOffRoute: () => setRerouteTick((t) => t + 1),
    onStopReached: handleStopReached,
  });
  const navProgressNow = turnByTurn.progress;
  // A convoy's next stop can be a shaping point (twisty leg): reaching it isn't an arrival.
  const arrivedAtDestination = turnByTurn.arrived && finalStopName != null;

  // Convoy leader reaching the current stop moves the convoy on to the next one.
  const completedOnArrivalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!turnByTurn.arrived || !rideState.isActive || !convoy.isLeader || !nextWaypoint) return;
    if (completedOnArrivalRef.current === nextWaypoint.id) return;
    completedOnArrivalRef.current = nextWaypoint.id;
    void completeWaypoint(nextWaypoint.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnByTurn.arrived]);

  // ── Weather routing ────────────────────────────────────────────────────────
  // When a route is set, forecast the precipitation the rider will actually hit
  // (per point, at their ETA for that point). If it's heavy, offer a detour.
  const weatherCheckedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!route || !destination || !userLocation) return;
    if (!settings.weatherRoutingEnabled) return;
    const key = `${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}`;
    if (weatherCheckedForRef.current === key || weatherVia) return;
    weatherCheckedForRef.current = key;

    let cancelled = false;
    (async () => {
      const weather = await checkRouteWeather(route.geometry, route.durationSeconds);
      if (cancelled || !weather?.worst || weather.worstMm < HEAVY_MM) return;

      const worst = weather.worst;
      const minsIn = Math.round((worst.etaMs - Date.now()) / 60000);
      toast.warning(`Heavy rain on your route${minsIn > 0 ? ` in ~${minsIn} min` : ""}`, {
        description: `${worst.mm.toFixed(1)} mm/h forecast where you'll be. Want a route around it?`,
        duration: 12000,
        action: {
          label: "Dry route",
          onClick: async () => {
            if (!userLocation) return;
            toast.loading("Finding a drier line…", { id: "dry-route" });
            const dry = await findDryRoute(
              userLocation,
              { lat: destination.lat, lng: destination.lng },
              isSolo ? soloRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })) : [],
              worst,
            );
            toast.dismiss("dry-route");
            if (!dry) {
              toast.error("No clearer route found from here");
              return;
            }
            setWeatherVia(dry.via);
            toast.success(dry.worstMm < HEAVY_MM ? "Rerouted around the weather" : "Best available route applied", {
              description: `Worst rain on the new line: ${dry.worstMm.toFixed(1)} mm/h`,
            });
          },
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [route, destination, userLocation, weatherVia, isSolo, soloRoute.stops, settings.weatherRoutingEnabled]);

  // A new destination invalidates any weather detour.
  useEffect(() => {
    setWeatherVia(null);
  }, [destination?.lat, destination?.lng]);

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
      type: "Feature" as const,
      geometry: route.geometry,
      properties: {},
    };

    const draw = () => {
      const existing = map.getSource(ROUTE_SOURCE_ID);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(feature);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: feature });
        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#000000", "line-opacity": 0.5, "line-width": 8 },
        });
        map.addLayer({
          id: ROUTE_LINE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": accentColor, "line-width": 4 },
        });
      }

      const recentlyInteracted = Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS;
      if (userLocation && !recentlyInteracted) {
        map.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 17,
          bearing: safeBearing(headingRef.current, map),
          pitch: threeDRef.current ? THREE_D_PITCH : 0,
          essential: true,
        });
      }
    };

    const cancelReady = whenStyleReady(map, draw);

    return () => {
      cancelReady();
      removeRouteLayers();
    };
  }, [map, route, accentColor]);

  // While guiding, trim the line behind the rider so only the road ahead shows.
  const trimmedAlongRef = useRef<number | null>(null);
  useEffect(() => {
    trimmedAlongRef.current = null;
  }, [route]);
  useEffect(() => {
    const nav = turnByTurn.nav;
    if (!map || !nav || !guiding || !navProgressNow) return;
    const along = navProgressNow.along;
    if (trimmedAlongRef.current != null && Math.abs(along - trimmedAlongRef.current) < 15) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    trimmedAlongRef.current = along;
    const coordinates = remainingLine(nav, along);
    if (coordinates.length < 2) return;
    source.setData({ type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} });
  }, [map, turnByTurn.nav, guiding, navProgressNow]);

  // ── Rescue route (secondary, always on top) ────────────────────────────────
  // When any convoy member fires the rescue button, everyone's map gains a
  // second route to that rider. The original destination/waypoints stay
  // untouched — this is drawn as an extra, glowing burn-orange line.
  const rescueTarget = rescue.target;
  const rescueRequestRef = useRef(0);
  useEffect(() => {
    if (!rescueTarget || !routingLocation) {
      setRescueRoute(null);
      return;
    }
    const id = ++rescueRequestRef.current;
    fetchRouteThroughStops([routingLocation, { lat: rescueTarget.lat, lng: rescueTarget.lng }])
      .then((result) => {
        if (rescueRequestRef.current === id) setRescueRoute(result);
      })
      .catch(() => {
        if (rescueRequestRef.current === id) setRescueRoute(null);
      });
  }, [rescueTarget, routingLocation]);

  useEffect(() => {
    if (!map) return;

    const removeRescueLayers = () => {
      try {
        if (!map.getStyle()) return;
        RESCUE_LAYER_IDS.forEach((id) => {
          if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(RESCUE_SOURCE_ID)) map.removeSource(RESCUE_SOURCE_ID);
      } catch {
        // Map already torn down.
      }
    };

    if (!rescueRoute) {
      removeRescueLayers();
      return;
    }

    const feature = {
      type: "Feature" as const,
      geometry: rescueRoute.geometry,
      properties: {},
    };

    let pulse: ReturnType<typeof setInterval> | null = null;

    const draw = () => {
      const existing = map.getSource(RESCUE_SOURCE_ID);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(feature);
      } else {
        map.addSource(RESCUE_SOURCE_ID, { type: "geojson", data: feature });
        map.addLayer({
          id: RESCUE_GLOW_OUTER_LAYER_ID,
          type: "line",
          source: RESCUE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": RESCUE_COLOR, "line-width": 20, "line-opacity": 0.18, "line-blur": 12 },
        });
        map.addLayer({
          id: RESCUE_GLOW_INNER_LAYER_ID,
          type: "line",
          source: RESCUE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": RESCUE_COLOR, "line-width": 11, "line-opacity": 0.35, "line-blur": 5 },
        });
        map.addLayer({
          id: RESCUE_LINE_LAYER_ID,
          type: "line",
          source: RESCUE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": RESCUE_COLOR, "line-width": 5 },
        });
      }

      // Keep the rescue line above the primary route no matter which was
      // created first (the primary route re-draws on every reroute).
      RESCUE_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) map.moveLayer(id);
      });

      // Soft breathing glow.
      let t = 0;
      pulse = setInterval(() => {
        t += 0.12;
        const wave = (Math.sin(t) + 1) / 2; // 0..1
        try {
          if (map.getLayer(RESCUE_GLOW_OUTER_LAYER_ID)) {
            map.setPaintProperty(RESCUE_GLOW_OUTER_LAYER_ID, "line-opacity", 0.12 + wave * 0.22);
          }
          if (map.getLayer(RESCUE_GLOW_INNER_LAYER_ID)) {
            map.setPaintProperty(RESCUE_GLOW_INNER_LAYER_ID, "line-opacity", 0.25 + wave * 0.3);
          }
        } catch {
          // style swapped mid-pulse
        }
      }, 90);
    };

    const cancelReady = whenStyleReady(map, draw);

    return () => {
      cancelReady();
      if (pulse) clearInterval(pulse);
      removeRescueLayers();
    };
  }, [map, rescueRoute, route, basemap]);

  // Rescue pin (secondary waypoint marker) at the stranded rider's location.
  useEffect(() => {
    if (!map) return;
    if (!rescueTarget) {
      rescueMarkerRef.current?.remove();
      rescueMarkerRef.current = null;
      return;
    }
    if (!rescueMarkerRef.current) {
      rescueMarkerRef.current = new maplibregl.Marker({
        element: createRescueMarkerElement(rescueTarget.userName || "Rider"),
        anchor: "bottom",
      })
        .setLngLat([rescueTarget.lng, rescueTarget.lat])
        .addTo(map);
    } else {
      rescueMarkerRef.current.setLngLat([rescueTarget.lng, rescueTarget.lat]);
    }
  }, [map, rescueTarget]);

  const handleSearchSelect = (result: MapSearchResult) => {
    if (addingWaypoint) {
      if (isSolo) {
        addSoloStop({ name: result.name, address: result.address, lat: result.lat, lng: result.lng });
      } else {
        addWaypoint({ name: result.name, address: result.address || "", lat: result.lat, lng: result.lng });
      }
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
  };

  // ── Derived display flags ──────────────────────────────────────────────────

  // Only solo riders and convoy leaders ever search (members follow the leader).
  const canSearch = isSolo || convoy.isLeader;
  const inConvoyRide = !isSolo && rideState.isActive && rideState.isConvoyMode;
  // In a convoy ride the status strip owns the top slot; a leader gets the
  // search bar back only while adding a stop. Solo: search unless moving.
  // Turn-by-turn takes the search bar's slot while guiding (a leader adding a
  // stop gets the search bar back until they pick one).
  // Any route being guided gets the banner (it shows "Follow the route" with
  // time/distance left when the router returned no manoeuvres), so the search
  // bar and the bottom destination card always make way for it.
  const showTurnBanner = guiding && !addingWaypoint;
  const showSearchBar = canSearch && (addingWaypoint || (!inConvoyRide && !moving && !showTurnBanner && !hazardWarning));
  const showConvoyStrip = inConvoyRide && !showSearchBar;
  const canSkipWaypoint = rideState.isActive && rideState.isConvoyMode && convoy.isLeader && nextWaypoint != null;
  // "Finish" replaces "Skip" once we're heading to the very last stop (the
  // final destination, with no intermediate waypoints left). Tapping it
  // clears the route so the map is blank and ready for a new plan.
  const canFinishRoute =
    rideState.isActive && destination != null && nextWaypoint == null && (isSolo || convoy.isLeader);

  // Banner X. Solo: the route is the rider's own, so it's cleared. Convoy: the
  // route belongs to the convoy, so only this rider's directions stop.
  const handleStopNavigating = () => {
    setGuiding(false);
    setNavDismissed(true);
    stopSpeaking();
    if (isSolo) {
      clearSoloRoute();
      setDestination(null);
      setRoute(null);
      if (!rideState.isActive) clearMapDestination();
      toast("Navigation ended");
    } else {
      toast("Directions off", { description: "The route stays on the map for your convoy." });
    }
  };

  const handleFinishRoute = async () => {
    if (isSolo) {
      clearSoloRoute();
    } else if (convoy.isLeader) {
      await clearDestination();
    }
    setDestination(null);
    setRoute(null);
    toast.success("Route finished");
  };

  const incompleteWaypoints = waypoints.filter((w) => !w.isCompleted);
  // Show waypoints panel in any convoy context, or in a solo ride when we
  // have a destination (so the rider can add/remove mid-ride stops).
  const showWaypointsPanel = convoy.id
    ? incompleteWaypoints.length > 0 || convoy.isLeader
    : rideState.isActive && !!destination;

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

      {/* Top-left column, left of the MapLibre controls: the top slot (search
          bar, or the convoy strip while riding in a convoy) with the toolbar
          flowing underneath, so when the search bar steps aside while moving
          the toolbar slides up into its place. */}
      <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(4.25rem+env(safe-area-inset-right))] short:right-auto short:w-[22rem] short:gap-1.5 z-30 flex flex-col items-start gap-2 pointer-events-none">
        {/* A hazard warning takes the search bar's slot too, above the turn banner. */}
        {hazardWarning && (
          <div className="w-full pointer-events-auto">
            <HazardBanner warning={hazardWarning} />
          </div>
        )}

        {showTurnBanner && (
          <div className="w-full pointer-events-auto">
            <TurnBanner
              progress={navProgressNow}
              describe={turnByTurn.describe}
              unit={settings.distanceUnit}
              arrived={arrivedAtDestination}
              rerouting={rerouting}
              finding={!route}
              destinationName={destination?.name}
              onStop={handleStopNavigating}
              onSkip={
                canSkipWaypoint
                  ? async () => {
                      await completeWaypoint(nextWaypoint!.id);
                      toast.success("Stop skipped");
                    }
                  : undefined
              }
            />
          </div>
        )}

        {showSearchBar && (
          <MapSearchBar
            inline
            autoFocus={addingWaypoint}
            map={map}
            userLocation={userLocation}
            countryCode={countryCode}
            nearbyCards={
              cardsEnabled && !rideState.isActive
                ? drops.map((d) => ({
                    id: `card:${d.id}`,
                    name: `${d.ownerName}'s ${d.vehicleName}`,
                    address: d.collected ? "Card · collected" : "Trading card drop",
                    lat: d.lat,
                    lng: d.lng,
                  }))
                : undefined
            }
            onSelect={handleSearchSelect}
          />
        )}

        {showConvoyStrip && (
          <div className="w-full space-y-1.5 pointer-events-auto">
            {rescueTarget && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-card/95 border border-destructive/60 shadow-lg backdrop-blur text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <p className="flex-1 min-w-0 truncate">
                  {rescueTarget.userId === user?.id ? (
                    <>
                      <span className="font-semibold">Rescue requested</span> · your convoy has your location
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{rescueTarget.userName || "A rider"} needs help</span>
                      {rescueRoute
                        ? ` · ${formatDistance(metersToMiles(rescueRoute.distanceMeters), settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)} · ${formatDuration(Math.round(rescueRoute.durationSeconds))}`
                        : " · route on map"}
                    </>
                  )}
                </p>
              </div>
            )}
            <MergeBadge convoy={convoy} onUnmerge={() => void getMergeControls()?.unmerge()} />
            <ConvoyStatusBar
              members={convoyMembers}
              myUserId={user?.id ?? null}
              myName={profile.name || "Leader"}
              isLeader={convoy.isLeader}
              myLocation={userLocation}
              destination={destination}
              routeSeconds={navProgressNow ? navProgressNow.remainingSeconds : route ? route.durationSeconds : null}
              speedUnit={settings.speedUnit}
            />
          </div>
        )}

      <div className="flex flex-row flex-wrap landscape:flex-nowrap items-start gap-2 pointer-events-auto">
        <div className="flex flex-row flex-wrap landscape:flex-nowrap items-center max-w-[calc(100vw-5rem)] landscape:max-w-none rounded-lg overflow-hidden border border-border shadow-lg bg-card/95 backdrop-blur">
          <button
            type="button"
            onClick={() => setBasemap("dark")}
            aria-pressed={basemap === "dark"}
            aria-label="Dark map"
            className={cn(
              "w-9 h-9 landscape:w-8 landscape:h-8 flex items-center justify-center transition-colors",
              basemap === "dark" ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <MapIcon className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
          </button>
          <div className="w-px h-6 landscape:h-5 bg-border" />
          <button
            type="button"
            onClick={() => setBasemap("satellite")}
            aria-pressed={basemap === "satellite"}
            aria-label="Satellite view"
            className={cn(
              "w-9 h-9 landscape:w-8 landscape:h-8 flex items-center justify-center transition-colors",
              basemap === "satellite" ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <Satellite className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
          </button>
          <div className="w-px h-6 landscape:h-5 bg-border" />
          <button
            type="button"
            onClick={() => setThreeD((v) => !v)}
            aria-pressed={threeD}
            aria-label="3D terrain and buildings"
            className={cn(
              "w-9 h-9 landscape:w-8 landscape:h-8 flex items-center justify-center transition-colors",
              threeD ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <Box className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
          </button>
          <div className="w-px h-6 landscape:h-5 bg-border" />
          <button
            type="button"
            onClick={() => {
              setShowOfflinePacks(false);
              setShowLoopPlanner((v) => !v);
            }}
            aria-pressed={showLoopPlanner}
            aria-label="Plan a loop ride"
            className={cn(
              "w-9 h-9 flex items-center justify-center transition-colors",
              showLoopPlanner ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <Repeat className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border" />
          <button
            type="button"
            onClick={() => {
              setShowLoopPlanner(false);
              setShowOfflinePacks((v) => !v);
            }}
            aria-pressed={showOfflinePacks}
            aria-label="Offline maps"
            className={cn(
              "w-9 h-9 flex items-center justify-center transition-colors",
              showOfflinePacks ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <Download className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border" />
          {/* Blacktop Radio — hidden unless enabled in Settings */}
          <RadioButton variant="map" />
          {canDropCard && (
            <>
              <div className="w-px h-6 bg-border" />
              <button
                type="button"
                onClick={() => setDroppingCard((v) => !v)}
                aria-pressed={droppingCard}
                aria-label="Drop a trading card on the map"
                className={cn(
                  "w-9 h-9 flex items-center justify-center transition-colors",
                  droppingCard ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
                )}
              >
                <IdCard className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Save Location (Add POI) — sits to the right of the toolbar and
            still left of the MapLibre top-right controls. */}
        <div>
          {showSaveUI ? (
            <div className="absolute top-full mt-2 left-0 bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur p-3 space-y-2 animate-slide-up w-64">
              <p className="text-xs font-semibold text-foreground">Name this spot</p>
              <Input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Home, Camp spot…"
                className="h-9 text-sm bg-background/60"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveName.trim() && userLocation) {
                    savePOI({ name: saveName.trim(), lat: userLocation.lat, lng: userLocation.lng });
                    toast.success(`"${saveName.trim()}" saved`);
                    setSaveName("");
                    setShowSaveUI(false);
                  }
                  if (e.key === "Escape") {
                    setSaveName("");
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
                    setSaveName("");
                    setShowSaveUI(false);
                  }}
                  className="flex-1 h-8 text-xs"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSaveName("");
                    setShowSaveUI(false);
                  }}
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
                  toast.info("Waiting for GPS fix…");
                  return;
                }
                setSaveName("");
                setShowSaveUI(true);
              }}
              className="p-2.5 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors"
              aria-label="Save current location as a POI"
            >
              <BookmarkPlus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nearby riders (opt-in): between save-location and the MapLibre controls. */}
        <HandshakeButton convoy={convoy} placement="down" />
      </div>
      </div>

      {droppingCard && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 px-3 py-2 rounded-xl bg-card/95 border border-accent shadow-xl backdrop-blur text-xs text-center">
          {pendingDrop ? (
            <>
              <p className="font-semibold">Place card here?</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-7 px-4 text-xs" onClick={() => confirmDropCard(false)}>
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-3 text-xs"
                  onClick={() => confirmDropCard(true)}
                >
                  Yes + Challenge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-4 text-xs"
                  onClick={() => {
                    setPendingDrop(null);
                    setDroppingCard(false);
                  }}
                >
                  No
                </Button>
              </div>
            </>
          ) : (
            <>Finding your spot…</>
          )}
        </div>
      )}

      {challengeRun && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-2xl border border-accent bg-card/95 shadow-2xl backdrop-blur px-4 py-3 text-center">
          {challengeRun.startsAt == null ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Setting challenge</p>
              <p className="mt-1 text-sm font-bold">Card dropped — this is your start line</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ready up for a 5-second countdown, then ride your route and hit Finish challenge. Five seconds are taken
                off your time for the stop.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => {
                    updateChallengeRun({ startsAt: Date.now() + CHALLENGE_COUNTDOWN_MS });
                    startRide(false);
                  }}
                >
                  Ready up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    clearChallengeRun();
                    setPendingChallengeReceipt(null);
                    toast("Challenge cancelled", { description: "Your card stays dropped without one." });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : challengeCountdown > 0 ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {challengeRun.mode === "setting" ? "Setting challenge" : "Time attack"}
              </p>
              <p className="text-5xl font-black tabular-nums text-accent leading-tight">{challengeCountdown}</p>
              <p className="text-xs text-muted-foreground">Get ready…</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <Flag className="w-4 h-4 text-accent" />
                <p className="text-sm font-bold truncate">
                  {challengeRun.mode === "setting" ? "Setting your route" : `Beat ${challengeRun.ownerName}`}
                </p>
              </div>
              <p className="text-4xl font-black tabular-nums leading-tight">
                {formatChallengeTime(challengeElapsedSec)}
              </p>
              {challengeRun.mode === "attempting" && challengeRun.targetSec != null && (
                <p
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    challengeElapsedSec < challengeRun.targetSec ? "text-[hsl(142_71%_45%)]" : "text-destructive",
                  )}
                >
                  Target {formatChallengeTime(challengeRun.targetSec)} ·{" "}
                  {formatDelta(challengeElapsedSec, challengeRun.targetSec)}
                </p>
              )}
              {challengeRun.mode === "attempting" && challengeRun.offRouteSince != null && (
                <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> Off route — get back on or the run is voided
                </p>
              )}
              <div className="flex gap-2 mt-2">
                {challengeRun.mode === "setting" ? (
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={finishSettingChallenge}>
                    Finish challenge
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    onClick={() => finalizeAttempt("void", challengeElapsedSec)}
                  >
                    Abandon run
                  </Button>
                )}
                {challengeRun.mode === "setting" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={async () => {
                      clearChallengeRun();
                      setPendingChallengeReceipt(null);
                      await endRide();
                      toast("Challenge cancelled", { description: "Your card stays dropped without one." });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showLoopPlanner && (
        <LoopPlannerPanel
          userLocation={userLocation}
          onClose={() => setShowLoopPlanner(false)}
          onApply={(loop) => {
            if (!userLocation) return;
            // A loop finishes where it starts: the via points become stops and
            // the rider's current position becomes the destination.
            const vias = loop.stops.slice(0, 5).map((s, i) => ({
              lat: s.lat,
              lng: s.lng,
              name: `Loop point ${i + 1}`,
            }));
            setSoloRoute({
              destination: { lat: userLocation.lat, lng: userLocation.lng, name: "Loop finish" },
              stops: vias,
            });
            setDestination({ lat: userLocation.lat, lng: userLocation.lng, name: "Loop finish" });
            setShowLoopPlanner(false);
            toast.success(
              `Loop ready · ${formatDistance(metersToMiles(loop.distanceMeters), settings.distanceUnit)} · ${formatDuration(Math.round(loop.durationSeconds))}`,
            );
          }}
        />
      )}

      {showOfflinePacks && <OfflinePacksPanel map={map} onClose={() => setShowOfflinePacks(false)} />}





      <div className="absolute bottom-3 left-3 right-3 short:right-auto short:w-[22rem] z-10 space-y-1.5">
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
                {isSolo
                  ? soloRoute.stops.map((wp, i) => (
                      <div
                        key={`solo-${i}`}
                        className="snap-start flex-shrink-0 w-44 flex items-center gap-2 px-3 py-2 bg-card/95 border border-border rounded-xl shadow-lg backdrop-blur text-sm"
                      >
                        <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
                          {i + 1}
                        </span>
                        <p className="flex-1 truncate text-xs">{wp.name || "Stop"}</p>
                        <button
                          onClick={() => removeSoloStopAt(i)}
                          className="p-1 hover:bg-muted rounded-full transition-colors flex-shrink-0"
                          aria-label={`Remove stop ${wp.name || i + 1}`}
                        >
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    ))
                  : incompleteWaypoints.map((wp, i) => (
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
                {((isSolo && soloRoute.stops.length < 5) ||
                  (!isSolo && convoy.isLeader && incompleteWaypoints.length < 5)) && (
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

        {/* The turn banner up top carries this whenever there's a destination. This card only
            shows after the rider closes the banner in a convoy (it stops just their own
            directions, the route stays): Go brings the banner back. */}
        {destination && (isRouting || route) && !showTurnBanner && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/95 border border-border shadow-2xl backdrop-blur animate-slide-up">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{destination.name || "Destination"}</p>
              {isRouting ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Finding route...
                </p>
              ) : route ? (
                <p className="text-xs text-muted-foreground">
                  {formatDistance(
                    metersToMiles(guiding && navProgressNow ? navProgressNow.remainingMeters : route.distanceMeters),
                    settings.distanceUnit,
                  )}{" "}
                  {getDistanceLabel(settings.distanceUnit)}
                  {" · "}
                  {formatDuration(
                    Math.round(guiding && navProgressNow ? navProgressNow.remainingSeconds : route.durationSeconds),
                  )}
                </p>
              ) : null}
            </div>

            {/* Start turn-by-turn without waiting to get moving. */}
            {route && !isRouting && !guiding && (
              <button
                onClick={() => {
                  setNavDismissed(false);
                  setGuiding(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-bold transition-colors flex-shrink-0"
                title="Start turn-by-turn directions"
              >
                Go
              </button>
            )}

            {/* Leader-only: skip current waypoint and advance to the next stop */}
            {canSkipWaypoint && (
              <button
                onClick={async () => {
                  await completeWaypoint(nextWaypoint!.id);
                  toast.success("Stop skipped");
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted hover:bg-secondary text-xs font-medium text-muted-foreground transition-colors flex-shrink-0"
                title="Skip this stop and advance to the next"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip
              </button>
            )}
            {!canSkipWaypoint && canFinishRoute && (
              <button
                onClick={handleFinishRoute}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-xs font-semibold text-accent transition-colors flex-shrink-0"
                title="Finish the route and clear the map"
              >
                <Flag className="w-3.5 h-3.5" />
                Finish
              </button>
            )}
            {!rideState.isActive && (
              <button
                onClick={() => {
                  setDestination(null);
                  setRoute(null);
                  clearSoloRoute();
                  clearMapDestination();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors flex-shrink-0"
                aria-label="Remove destination"
                title="Remove destination"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Landscape (short:): the speed card sits bottom-left, credits beside it. */}
        <div className="flex flex-col items-center short:items-start gap-1.5">
          <div className="px-2 py-0.5 text-[10px] text-muted-foreground/70 pointer-events-none short:hidden">
            Weather: RainViewer
          </div>

          {/* Bottom-left action stack (Rescue above Report): beside the speed card in
              portrait, directly above it in landscape (short:). */}
          <div className="w-full grid grid-cols-[1fr_auto_1fr] items-end gap-2 short:flex short:flex-col short:items-start short:gap-1.5">
            <div className="flex flex-col items-start gap-2 justify-self-start pointer-events-auto">
              {/* Rescue — available while the map overlay covers ActiveRide. */}
              {rescue.canRequest && (
                <button
                  onClick={() => {
                    void (rescue.hasPending ? rescue.cancel?.() : rescue.send?.());
                  }}
                  className={cn(
                    "p-2.5 rounded-full border shadow-lg backdrop-blur transition-colors",
                    rescue.hasPending
                      ? "bg-[hsl(var(--burn))]/25 border-[hsl(var(--burn))] text-[hsl(var(--burn))] animate-pulse"
                      : "bg-card/95 border-border text-warning hover:bg-warning/20",
                  )}
                  aria-label={rescue.hasPending ? "Cancel rescue request" : "Request rescue"}
                  title={rescue.hasPending ? "Cancel rescue request" : "Request rescue"}
                >
                  <AlertTriangle className="w-5 h-5" />
                </button>
              )}
              <HazardReport
                getPosition={() => (userLocation ? { ...userLocation, heading: headingRef.current ?? null } : null)}
              />
            </div>
            {/* Show speed for active ride OR home-map preview (never saved) */}
            {(rideState.isActive || geoSpeed > 0) && (
              <div
                className={cn(
                  "flex items-baseline gap-1.5 px-5 py-3 short:px-4 short:py-2 rounded-2xl bg-card/95 border border-border shadow-lg backdrop-blur font-mono font-bold tabular-nums transition-colors",
                  speedColorClass,
                )}
              >
                <span className="text-5xl short:text-4xl leading-none">{formatSpeed(displaySpeed, settings.speedUnit)}</span>
                <span className="text-sm opacity-70">{getSpeedLabel(settings.speedUnit)}</span>
              </div>
            )}
            <div aria-hidden className="short:hidden" />
          </div>

          {/* Landscape (short:): the credits move up beside the search bar (below), clear of the speed card. */}
          <div className="px-2 py-0.5 text-[10px] text-muted-foreground/70 pointer-events-none text-center short:hidden">
            <MapCredits />
          </div>
        </div>
      </div>

      {/* Landscape: credits at the top, just right of the (22rem) search column. */}
      <div className="hidden short:block absolute top-[calc(0.75rem+env(safe-area-inset-top)+0.6rem)] left-[calc(0.75rem+env(safe-area-inset-left)+22.75rem)] z-20 px-2 py-0.5 rounded-md bg-background/40 text-[10px] text-muted-foreground/80 pointer-events-none whitespace-nowrap">
        <MapCredits />
      </div>

      {/* Tapped hazard: what it is, still there / gone. */}
      {tappedHazard && !pin && (
        <HazardCard
          hazard={tappedHazard}
          onClose={() => setHazardId(null)}
          className="absolute left-3 right-3 bottom-3 short:right-auto short:w-[22rem] z-30"
        />
      )}

      {/* Tapped pin: the camera orbits it; Back unlocks, Navigate sets the route. */}
      {pin && (
        <div className="absolute left-3 right-3 bottom-3 short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-3 animate-slide-up">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{pin.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {pin.category}
                {userLocation ? ` · ${formatDistance(metersToMiles(calculateDistance(userLocation.lat, userLocation.lng, pin.lat, pin.lng) * 1000), settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)} away` : ""}
              </p>
            </div>
            {pin.kind === "saved" ? (
              <button
                className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (pin.id) deletePOI(pin.id);
                  toast("Removed from saved places");
                  exitOrbit(true);
                }}
                aria-label="Remove from saved places"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10"
                onClick={() => {
                  const saved = savePOI({ name: pin.name, lat: pin.lat, lng: pin.lng });
                  toast.success(`${pin.name} saved`);
                  setPin({ ...pin, kind: "saved", category: "Saved place", id: saved.id });
                }}
                aria-label="Save this place"
              >
                <BookmarkPlus className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => exitOrbit(true)}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={() => {
                const target = pin;
                exitOrbit(false);
                handleSearchSelect({ id: target.id ?? `pin:${target.lat.toFixed(5)},${target.lng.toFixed(5)}`, name: target.name, address: target.address || target.category, lat: target.lat, lng: target.lng });
              }}
            >
              <Navigation className="w-3.5 h-3.5" /> Navigate
            </Button>
          </div>
        </div>
      )}

      {selectedDrop && (
        <div className="absolute inset-x-3 bottom-3 short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setSelectedStack(null)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-secondary"
            aria-label="Close card details"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-accent" />
            <p className="text-sm font-bold truncate">{selectedDrop.vehicleName}</p>
            {selectedDrop.collected && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(142_71%_45%)]">
                <Check className="w-3 h-3" /> Collected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedDrop.ownerName} · {selectedDrop.makeModel || "Unknown model"} · {selectedDrop.tier}
          </p>
          {selectedDrop.challenge && (
            <div className="mt-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Time attack</p>
              <p className="text-xs text-muted-foreground">
                Beat {formatChallengeTime(selectedDrop.challenge.timeSec)} over{" "}
                {formatDistance(selectedDrop.challenge.distanceMi, settings.distanceUnit)}{" "}
                {getDistanceLabel(settings.distanceUnit)} · stay on route
              </p>
            </div>
          )}
          {userLocation && (
            <p className="text-xs text-muted-foreground mt-1">
              {formatDistance((metersBetween(userLocation, selectedDrop) / 1000) * 0.621371, settings.distanceUnit)}{" "}
              {getDistanceLabel(settings.distanceUnit)} away
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                setDestination({
                  lat: selectedDrop.lat,
                  lng: selectedDrop.lng,
                  name: `${selectedDrop.ownerName}'s card`,
                });
                setSelectedStack(null);
              }}
            >
              Go for it
            </Button>
            {selectedDrop.challenge && (
              <Button size="sm" variant="secondary" onClick={() => takeChallenge(selectedDrop)}>
                Take challenge
              </Button>
            )}
            {selectedDrop.isOwn ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await pickUpDrop.mutateAsync(selectedDrop.id);
                  setSelectedStack(null);
                  toast.success("Card picked back up");
                }}
              >
                Pick up
              </Button>
            ) : (
              !selectedDrop.collected && (
                <Button size="sm" variant="outline" onClick={() => handleCollectDrop(selectedDrop)}>
                  Scan
                </Button>
              )
            )}
          </div>
        </div>
      )}

      {selectedStack && selectedStack.length > 1 && (
        <div className="absolute inset-x-3 bottom-3 short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setSelectedStack(null)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-secondary"
            aria-label="Close card hot-spot"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-accent" />
            <p className="text-sm font-bold">Card hot-spot</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {selectedStack.length} cards
            </span>
          </div>
          {userLocation && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDistance((metersBetween(userLocation, selectedStack[0]) / 1000) * 0.621371, settings.distanceUnit)}{" "}
              {getDistanceLabel(settings.distanceUnit)} away
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3 max-h-44 overflow-y-auto">
            {selectedStack.map((d) => {
              const done = d.collected || d.isOwn;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-xl border p-2 text-left",
                    done ? "border-[hsl(142_71%_45%)]/60 bg-[hsl(142_71%_45%)]/8" : "border-border bg-secondary/40",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold truncate flex-1">{d.vehicleName}</p>
                    {done && <Check className="w-3 h-3 text-[hsl(142_71%_45%)] shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {d.ownerName} · {d.tier}
                  </p>
                  {d.challenge && (
                    <p className="text-[10px] font-bold text-accent">⏱ {formatChallengeTime(d.challenge.timeSec)}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                setDestination({
                  lat: selectedStack[0].lat,
                  lng: selectedStack[0].lng,
                  name: "Card hot-spot",
                });
                setSelectedStack(null);
              }}
            >
              Go for it
            </Button>
            {selectedStack.some((d) => !d.collected && !d.isOwn) && (
              <Button size="sm" variant="outline" onClick={() => handleCollectStack(selectedStack)}>
                Collect all
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Basemap credits (MapLibre's own attribution control is hidden; see blacktopMap.css). */
function MapCredits() {
  return (
    <>
      ©{" "}
      <a
        href="https://openfreemap.org"
        target="_blank"
        rel="noreferrer"
        className="hover:text-muted-foreground underline-offset-2 hover:underline pointer-events-auto"
      >
        OpenFreeMap
      </a>{" "}
      ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="hover:text-muted-foreground underline-offset-2 hover:underline pointer-events-auto"
      >
        OpenStreetMap
      </a>{" "}
      contributors
    </>
  );
}
