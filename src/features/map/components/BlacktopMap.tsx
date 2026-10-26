import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./blacktopMap.css";
import { closeBlacktopMap, clearMapDestination, setBlacktopMapReady } from "../hooks/useMapOverlay";
import { useRadarOverlay } from "../hooks/useRadarOverlay";
import { registerTileCacheProtocol, toCachedTileUrl } from "../lib/tileCache";
import { calculateDistance, getCountryCode, getRecentLocations, placeDetails, saveRecentLocation, type MapSearchResult } from "../lib/placeSearch";
import {
  fetchTrafficCameras,
  fetchCamerasOnRoute,
  metersBetween,
  CAMERA_MIN_ZOOM,
  TrafficCamera,
} from "../lib/cameraStore";
import { pingSpeedCamera, pingAnprCamera } from "../lib/cameraPing";
import { fetchRouteThroughStops, metersToMiles, RouteResult } from "../lib/routing";
import { routeStyleVias, twistyLegs, isTwistyLeg, type RouteStyle } from "../lib/routeStyle";
import { isRoutingOffline, useRoutingOffline } from "../lib/routingStatus";
import { checkRouteWeather, findDryRoute, HEAVY_MM } from "../lib/weatherRoute";
import { RadioButton } from "@/features/radio";
import { useNextWaypoint } from "@/features/waypoints";
import { MapSearchBar, type FitPadding } from "./MapSearchBar";
import { LoopPlannerPanel } from "./LoopPlannerPanel";
import { OfflinePacksPanel } from "./OfflinePacksPanel";
import { TurnBanner } from "./TurnBanner";
import { whenStyleReady } from "../lib/whenStyleReady";
import { useTurnByTurn } from "../hooks/useTurnByTurn";
import { remainingLine, shortDistance } from "../lib/navigation";
import { navAppLabel, openInNavApp } from "../lib/navHandoff";
import { shareText } from "../lib/shareText";
import { useExperience, type PlaceCategory } from "@/features/experience";
import { stopSpeaking } from "../lib/speech";
import { MapDestination } from "../types";
import { deletePOI, getSavedPOIs, savePOI } from "../lib/poiStore";
import { loadDarkMapStyle } from "../lib/darkStyle";
import { getLastView, saveLastView } from "../lib/lastView";
import { addPinLayers, clearCategoryPins, setMyPins, setPinsVisible, showCategoryPins, type PinInfo } from "../lib/mapPins";
import { addCardDropLayer, setCardDropData, type CardPin } from "../lib/cardDropLayer";
import { CardDropPrompt } from "./CardDropPrompt";
import { getActiveBikeIdSnapshot } from "@/features/garage/hooks/useGarage";
import { AlarmControl } from "../lib/alarmControl";
import { applyWaterWordmark } from "../lib/waterWordmark";
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
import { ArrowLeft, BookmarkPlus, ChevronDown, Clock3, Trash2, WifiOff } from "lucide-react";
import { useMapPresentUserIds } from "../hooks/useMapPresence";
import { ACCENT_COLORS, useSettings } from "@/features/settings";
import { useProfile } from "@/features/profile";

import {
  useActiveRide,
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
import { isThermal } from "@/lib/thermal";
import { chooseRouteTrip } from "@/features/ride/lib/trips";
import { switchLegs, playLegs, inOutCubic, type Cam } from "../lib/switchCamera";
import { RiderTrack } from "../lib/riderTrack";
import { speedBands, useSpeedLimit } from "@/lib/speedLimit";
import { SpeedLimitSign } from "@/components/SpeedLimitSign";
import {
  Navigation,
  Loader2,
  Waves,
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

import { useRescueBridge, MapRescueButton } from "@/features/rescue";
import { useCardDrops, dropToPayload, COLLECT_RADIUS_M, type CardDrop } from "@/features/cards/hooks/useCardDrops";
import { useCollectedCards, useVehicleCards } from "@/features/cards";
import { copyLedger } from "@/features/cards/lib/dropEconomy";
import { uploadCardPhoto } from "@/features/cards/lib/cardPhoto";
import { tr } from '@/lib/i18n';
import { metresText } from '@/lib/units';
import { PageTips } from '@/features/guide';
import { setGuidanceActive } from '../lib/guidanceState';
import { setNavShare } from '../lib/navShare';
import { etaClock, etaSpread, travelTime } from '../lib/eta';
import { openText, openTint, parseOpeningHours, placeStatus, weekLines } from '@/lib/openingHours';
import { currencySign, type PriceInfo } from '@/lib/priceLevel';
import { PriceSigns } from '@/components/PlaceFacts';
import { useStationPrices, perUnitText, reportsText } from '@/lib/fuelPrices';
import { fuelName } from '@/features/garage/lib/ledger';
import { W3WAddress } from '@/components/W3WAddress';
import { resolveWhat3WordsResult, W3W_RESULT_PREFIX } from '@/lib/what3words';
import { noteLocationGranted } from '@/lib/locationGrant';
import { ParkedSpotPin } from './ParkedSpotPin';
import { glideMarker } from '@/lib/markerGlide';
import { PixelLoader } from '@/components/PixelLoader';

// How long the home map (no active ride) can stay idle before auto-closing.
const HOME_MAP_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * A convoy rider's pin: an empty box MapLibre positions (it owns that element's
 * transform) holding the round letter badge, which carries every style. The
 * speaking scale used to be set on the box itself, which replaced MapLibre's
 * position with a bare scale: every member update slid the pin towards the
 * map's corner for a moment before the next redraw put it back.
 */
function createMemberMarkerElement(): HTMLDivElement {
  const box = document.createElement("div");
  const el = document.createElement("div");
  box.appendChild(el);
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
  return box;
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

/** Metres between two points (short distances). */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function safeBearing(heading: number | null, map: MapLibreMap): number {
  return heading != null && Number.isFinite(heading) ? heading : map.getBearing();
}

function applyMemberMarkerStyle(
  box: HTMLDivElement,
  name: string,
  colorStyles: ReturnType<typeof getMemberColorStyles>,
  isSpeaking: boolean,
) {
  // The badge inside the box MapLibre moves (see createMemberMarkerElement).
  const el = box.firstElementChild as HTMLDivElement;
  el.textContent = (name.trim()[0] || "?").toUpperCase();
  el.style.backgroundColor = colorStyles.bg;
  el.style.borderColor = colorStyles.border;
  el.style.color = colorStyles.text;
  el.style.boxShadow = isSpeaking ? colorStyles.glow : "none";
  el.style.transform = isSpeaking ? "scale(1.15)" : "scale(1)";
}

/** The way to a pin whose card is up: dashed, under the pins (it isn't the ride's route). */
const PIN_ROUTE_SOURCE_ID = "blacktop-pin-route";
const PIN_ROUTE_CASING_ID = "blacktop-pin-route-casing";
const PIN_ROUTE_LINE_ID = "blacktop-pin-route-line";
/** Where a pin is, as a key (its card's route and facts belong to the place, not to the pin object). */
const pinKeyOf = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

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
/** The follow zoom until the rider zooms for themselves (see NAV_ZOOM_KEY). */
const DEFAULT_FOLLOW_ZOOM = 16.5;

// The follow camera holds the rider's own zoom: any zoom they make themselves
// (pinch, wheel, the +/- buttons), with a route or without, becomes the follow
// zoom, kept across sessions, so the camera never puts its own zoom back.
// (Without a route it used to be pushed to at least 16 on every fix.)
const NAV_ZOOM_KEY = 'blacktop_nav_zoom';
const NAV_ZOOM_MIN = 12;
const NAV_ZOOM_MAX = 19;
const clampNavZoom = (z: number) => Math.min(NAV_ZOOM_MAX, Math.max(NAV_ZOOM_MIN, z));
/**
 * Riding into the amber and red speed colours pulls the follow camera out a little each
 * (zoom levels off the rider's own), so there's more road ahead at speed. Coming back
 * down waits a few seconds, so hovering on a threshold doesn't pump the zoom. A zoom the
 * rider makes while pulled out holds as theirs (not saved) until recentre.
 */
const SPEED_ZOOM_OUT = [0, 0.6, 1.2];
/** With the colours tied to the road's limit (settings.speedLimitColours): one pull-out, on red. */
const SPEED_ZOOM_LIMIT_RED = 1;
const SPEED_ZOOM_SETTLE_MS = 4000;
/** How fast the pull-out glides in or out (zoom levels a second), so it's a drift across a few fixes, never a step. */
const SPEED_ZOOM_RATE = 0.25;
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
/** The `short:` screen (tailwind.config.ts): a phone on its side. */
const SHORT_QUERY = "(orientation: landscape) and (max-height: 560px)";
function readNavZoom(): number {
  try {
    const z = parseFloat(localStorage.getItem(NAV_ZOOM_KEY) ?? '');
    return Number.isFinite(z) ? clampNavZoom(z) : DEFAULT_FOLLOW_ZOOM;
  } catch {
    return DEFAULT_FOLLOW_ZOOM;
  }
}

interface BlacktopMapProps {
  initialDestination?: MapDestination | null;
  onContextLost?: () => void;
  isVisible?: boolean;
  /** Bumped by the overlay when the home map closes: end the route and guidance. */
  resetSeq?: number;
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

export function BlacktopMap({ initialDestination, onContextLost, isVisible, resetSeq = 0 }: BlacktopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // Orbiting a tapped pin: GPS follow holds off, and Back restores this camera.
  const orbitingRef = useRef(false);
  /** The rider's navigation zoom (see NAV_ZOOM_KEY). */
  const navZoomRef = useRef(readNavZoom());
  /** A zoom made while the speed colours had the camera pulled out: held until recentre (see SPEED_ZOOM_OUT). */
  const zoomOverrideRef = useRef<number | null>(null);
  /** How far the speed colours have the camera pulled out now, and since when the speed has been asking for less. */
  const speedZoomRef = useRef({ out: 0, lowerSince: 0, shown: 0, at: 0 });
  /** The speed row (Report and the speed card): the follow camera keeps the rider just above it. */
  const speedRowRef = useRef<HTMLDivElement>(null);
  /** The haze the switch camera climbs into (opacity and scale set per frame, outside React). */
  const switchHazeRef = useRef<HTMLDivElement>(null);
  const preOrbitCameraRef = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number; onRider?: boolean } | null>(null);
  /** The switch camera taking the rider back out of an orbit (Back): its stop, while it runs. GPS follow holds off meanwhile. */
  const returnStopRef = useRef<(() => void) | null>(null);
  /** Recentre from far away: the switch back onto the rider. Returns false (leave it to MapLibre) when it isn't worth one. */
  const switchHomeRef = useRef<((landed: () => void) => boolean) | null>(null);
  /** Where the rider is drawn between GPS fixes (lib/riderTrack), and the follow loop's nudge. */
  const trackRef = useRef(new RiderTrack());
  const kickFollowRef = useRef<() => void>(() => {});
  /** A quick search's tiles are on the map (Back from one of its places returns to that overview). */
  const quickUpRef = useRef(false);
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
  const { terms } = useExperience();
  const { rideState } = useActiveRide();
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
  // The road's limit (lib/speedLimit): its sign on the speed card, and with the limit colours on, the amber / red.
  const speedLimit = useSpeedLimit();
  const bands = speedBands(settings, speedLimit);
  // Same amber / red glow as the ride screen's speed hero.
  const speedColorClass =
    displaySpeed >= bands.red
      ? "text-destructive animate-speed-glow-red border-destructive/60"
      : displaySpeed >= bands.amber
        ? "text-warning animate-speed-glow border-warning/50"
        : "text-foreground border-border";


  const userMarkerRef = useRef<Marker | null>(null);
  const headingRef = useRef<number | null>(null);
  // Mirrors the 3D toggle so the follow-camera calls (which live in effects with
  // stable deps) can keep the chase pitch instead of flattening the map.
  const threeDRef = useRef(false);
  const hasFollowedUserRef = useRef(false);
  const lastInteractionAtRef = useRef(Date.now());
  // Rider panned the map with no route set: don't snap back until they tap locate.
  const freePanRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  /** The rider's speed (m/s) and its rate of change (m/s², smoothed), for the camera's sway while guiding. */
  const motionRef = useRef<{ speed: number; accel: number; at: number }>({ speed: 0, accel: 0, at: 0 });
  const speedColourRef = useRef({ speed: 0, amber: Infinity, red: Infinity, byLimit: false });
  speedColourRef.current = { speed: displaySpeed, ...bands };

  /**
   * The follow camera's zoom: a zoom the rider held while pulled out, else their own
   * zoom less the speed colours' pull-out (stepping out straight away, back in only
   * once the speed has stayed lower for SPEED_ZOOM_SETTLE_MS).
   */
  const followZoom = () => {
    if (zoomOverrideRef.current != null) return zoomOverrideRef.current;
    const { speed, amber, red, byLimit } = speedColourRef.current;
    // Tied to the road's limit, amber is just over it, so only red pulls out, once.
    const want = byLimit ? (speed >= red ? SPEED_ZOOM_LIMIT_RED : 0) : SPEED_ZOOM_OUT[speed >= red ? 2 : speed >= amber ? 1 : 0];
    const z = speedZoomRef.current;
    const now = Date.now();
    if (want >= z.out) {
      z.out = want;
      z.lowerSince = 0;
    } else if (!z.lowerSince) {
      z.lowerSince = now;
    } else if (now - z.lowerSince >= SPEED_ZOOM_SETTLE_MS) {
      z.out = want;
      z.lowerSince = 0;
    }
    // Glide towards it: a step of 0.6 inside one fix's ease read as a lurch.
    const dt = z.at ? Math.min(2, (now - z.at) / 1000) : 0;
    z.at = now;
    const gap = z.out - z.shown;
    z.shown += Math.sign(gap) * Math.min(Math.abs(gap), SPEED_ZOOM_RATE * dt);
    return Math.max(NAV_ZOOM_MIN - 2, navZoomRef.current - z.shown);
  };

  /**
   * Where the follow camera puts the rider: low on the screen, just above the speed
   * card, so the map shows the road ahead rather than the road behind; in landscape
   * lower still and to the right of the left-hand column. Done as camera padding, so
   * map.getCenter() is still the rider and every "on the rider" check holds.
   */
  const followPadding = (): typeof NO_PADDING => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.height < 200 || box.width < 200) return NO_PADDING;
    const h = box.height;
    const landscape = !!window.matchMedia?.(SHORT_QUERY).matches;
    const row = speedRowRef.current;
    let y = h * (landscape ? 0.74 : 0.7);
    let left = 0;
    if (row) {
      const kids = Array.from(row.children).map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
      if (landscape) {
        // The left-hand column (speed card, Report): centre the view in what's right of it.
        const right = Math.max(0, ...kids.map((r) => r.right - box.left));
        left = Math.min(box.width * 0.35, right);
      } else if (kids.length) {
        // Just above the speed card (or Report), clear of the pin's own size.
        y = Math.min(...kids.map((r) => r.top - box.top)) - 64;
      }
    }
    y = Math.min(h * 0.78, Math.max(h * 0.5, y));
    const snap = (v: number) => Math.max(0, Math.round(v / 8) * 8);
    return { top: snap(2 * y - h), bottom: 0, left: snap(left), right: 0 };
  };

  /** Off the follow view (a place, an overview): the padding goes, the picture staying where it is. */
  const dropFollowPadding = (m: MapLibreMap) => {
    const p = m.getPadding();
    if (!p.top && !p.bottom && !p.left && !p.right) return;
    const c = m.getCanvas();
    m.jumpTo({ center: m.unproject([c.clientWidth / 2, c.clientHeight / 2]), padding: NO_PADDING });
  };
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
        toast.info(tr("Map closed due to inactivity"));
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
      pixelRatio: MAP_PIXEL_RATIO,
        container: containerRef.current,
        style,
        center: center as [number, number],
        zoom: initialDestination ? 15 : last?.zoom ?? 14,
        attributionControl: false,
        // The switch camera's jumps zoom in quick steps: keep the tiles they asked for coming.
        cancelPendingTileRequestsWhileZooming: false,
      });

      instance.addControl(new maplibregl.AttributionControl({ compact: true }));
      // Compass only turns with the bearing: with visualizePitch it also squashed in 3D as
      // the map tilted (orbiting a pin, 3D mode), which looked broken. Tilt has its own button.
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      // Recentre straight under the compass, then the anti-theft alarm's siren.
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        // Blacktop draws the rider's own marker; MapLibre's blue dot sat on top of it for good.
        showUserLocation: false,
        showAccuracyCircle: false,
      });
      instance.addControl(geolocate, "top-right");
      // Its own camera off: while lit it re-fitted the view to every fix (up to zoom 15), so a
      // zoom bounced straight back. Blacktop's follow camera (the GPS watch below) is the only one.
      (geolocate as unknown as { _updateCamera: (p: GeolocationPosition) => void })._updateCamera = () => {};
      instance.addControl(new AlarmControl(), "top-right");
      // The locate button hands the camera back to GPS follow after free panning: only the press
      // itself (tracking starting). Every fix the control reports ("geolocate") used to count too,
      // so once it had been pressed, panning away snapped back to the rider five seconds later.
      const resumeFollow = () => {
        freePanRef.current = false;
        lastInteractionAtRef.current = Date.now() - LOCATE_RESUME_DELAY_MS; // follow now, and still a touch for the idle auto-close (0 closed the map)
        // Back over the rider now, at their own zoom: the follow loop glides there
        // (the switch camera does it from far away).
        kickFollowRef.current();
      };
      geolocate.on("trackuserlocationstart", resumeFollow);
      // Far from the rider, recentre is the switch camera back onto them (switchHomeRef),
      // and MapLibre's own tracking (the button's lit state) starts once it has landed.
      const locateButton = instance.getContainer().querySelector<HTMLButtonElement>(".maplibregl-ctrl-geolocate");
      locateButton?.addEventListener(
        "click",
        (e) => {
          // Recentre gives the speed colours the zoom back (the rider's own saved zoom stays).
          zoomOverrideRef.current = null;
          if (!switchHomeRef.current?.(() => geolocate.trigger())) return;
          e.stopImmediatePropagation();
          e.preventDefault();
        },
        true,
      );

      const markInteraction = (e: { originalEvent?: unknown }) => {
        if (!e.originalEvent) return;
        lastInteractionAtRef.current = Date.now();
        // No route: free panning stays put (no auto snap-back); the locate button re-centres.
        if (!destinationRef.current) freePanRef.current = true;
      };
      // Zooming isn't panning away: following carries on (at the new zoom) once the hand is off.
      const markZoom = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) lastInteractionAtRef.current = Date.now();
      };
      instance.on("dragstart", markInteraction);
      instance.on("zoomstart", markZoom);
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
            // Under the first label layer: added on top, the buildings buried place names and every pin.
            const firstLabel = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
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
            }, firstLabel);
          }
          if (m.getPitch() < THREE_D_PITCH - 1) {
            const loc = userLocationRef.current;
            m.easeTo({
              pitch: THREE_D_PITCH,
              ...(loc && !orbitingRef.current ? { center: [loc.lng, loc.lat] as [number, number], padding: followPadding() } : {}),
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

  // Turn-by-turn guidance on (declared up here for the GPS watch below).
  const [guiding, setGuiding] = useState(false);
  // Rain radar: lighter while guiding.
  useRadarOverlay(map, displaySpeed, settings.weatherOverlayEnabled, guiding);
  // Shared with other screens (Home locks its swipe deck while guiding).
  useEffect(() => {
    setGuidanceActive(guiding);
    return () => setGuidanceActive(false);
  }, [guiding]);

  // ── Geolocation watch ──────────────────────────────────────────────────────
  // Only while the map is on screen, or while it's guiding (spoken directions
  // carry on with the map closed). The overlay stays mounted (hidden) after its
  // first open, and this watch used to keep GPS, re-renders and camera
  // animations going for the rest of the session. A ride tracks itself.
  useEffect(() => {
    if ((!isVisible && !guiding) || !("geolocation" in navigator)) return;

    let countryResolved = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
        noteLocationGranted();
        const fixAt = Date.now();
        // Where the pin and the camera are drawn between fixes (see RiderTrack).
        trackRef.current.fix(loc.lat, loc.lng, fixAt, position.coords.speed, position.coords.heading);
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
        {
          // Speed and how fast it's changing: braking dips the camera, pulling away lifts it.
          const m = motionRef.current;
          const v = Number.isFinite(speed) && speed >= 0 ? speed : m.speed;
          const dt = m.at ? (fixAt - m.at) / 1000 : 0;
          const raw = dt > 0.2 && dt < 5 ? (v - m.speed) / dt : 0;
          motionRef.current = { speed: v, accel: m.accel + (Math.max(-8, Math.min(8, raw)) - m.accel) * 0.5, at: fixAt };
        }
        if (heading != null && Number.isFinite(heading) && speed > 0.5) {
          headingRef.current = heading;
        }

        if (!countryResolved) {
          countryResolved = true;
          const code = await getCountryCode(loc.lat, loc.lng);
          if (code) setCountryCode(code);
        }

        const map = mapRef.current;
        if (!map || !isVisible) return; // hidden (guiding only): no camera work
        // The follow loop draws the pin (and, while following, the camera) frame by frame from here.
        kickFollowRef.current();
        if (orbitingRef.current) return; // looking round a pin: don't yank the camera away
        if (returnStopRef.current) return; // the switch camera is taking them back

        if (!hasFollowedUserRef.current) {
          hasFollowedUserRef.current = true;
          map.flyTo({
            center: [loc.lng, loc.lat],
            zoom: followZoom(),
            padding: followPadding(),
            bearing: safeBearing(headingRef.current, map),
            pitch: threeDRef.current ? THREE_D_PITCH : 0,
            essential: true,
          });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, guiding]);

  // ── The rider's navigation zoom ──────────────────────────────────────────
  // A zoom the rider makes themselves (pinch, wheel, the +/- buttons: events
  // with an originalEvent, never the camera's own moves) becomes their follow
  // zoom, route or no route. Not while looking round a pin.
  useEffect(() => {
    if (!map) return;
    const onZoomEnd = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent || orbitingRef.current) return;
      const z = clampNavZoom(map.getZoom());
      // Pulled out by the speed colours (or already holding one): this zoom holds until
      // recentre, and the rider's saved zoom stays as it was.
      if (speedZoomRef.current.out > 0 || zoomOverrideRef.current != null) {
        zoomOverrideRef.current = z;
        return;
      }
      navZoomRef.current = z;
      try {
        localStorage.setItem(NAV_ZOOM_KEY, z.toFixed(2));
      } catch {
        /* this session only */
      }
    };
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [map]);

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
      if (freePanRef.current && !destinationRef.current) return;
      resumed = true;
      freePanRef.current = false;
      // The follow loop glides back over the rider.
      kickFollowRef.current();
    }, 1000);

    return () => {
      clearInterval(tick);
      container.removeEventListener("touchstart", mark);
      container.removeEventListener("mousedown", mark);
      container.removeEventListener("wheel", mark);
    };
  }, [map, isVisible]);

  // ── Follow loop ──────────────────────────────────────────────────────────────
  // One frame loop draws the rider's pin and, while following, the camera, from
  // RiderTrack (carried on between fixes at the rider's speed, corrections faded
  // in), so both move continuously. A camera eased once a fix stalled or lurched
  // whenever a fix came early or late, which read as a jolt every second. The
  // turn, tilt and the rider's place on the screen are smoothed towards theirs;
  // taking the camera back (recentre, five seconds after a hand on the map, the
  // end of any other camera move) glides there from wherever it is. It stops
  // itself once the rider is still and everything has arrived (no idle frames),
  // and every fix, recentre and resume nudges it (kickFollowRef).
  useEffect(() => {
    if (!map || !isVisible) return;
    let raf = 0;
    let last = 0;
    let following = false;
    let blend: { center: maplibregl.LngLat; zoom: number; at: number } | null = null;
    let bearing = 0;
    let pitch = 0;
    let pad = { ...NO_PADDING };
    const BLEND_MS = 900;
    const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
    const frame = (now: number) => {
      raf = 0;
      const track = trackRef.current;
      if (!track.hasFix) return;
      // The frame's own time (on the same clock as the fixes' Date.now()), so each frame moves by exactly its share.
      const t = performance.timeOrigin + now;
      // Thermal mode and reduced motion: straight to each fix, one frame a fix, nothing in between.
      const still = isThermal() || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const dt = still ? 1e3 : last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const pos = still ? track.latest! : track.step(t);
      userMarkerRef.current?.setLngLat([pos.lng, pos.lat]);
      let busy = !still && !track.settled(t);
      const canFollow =
        hasFollowedUserRef.current &&
        !orbitingRef.current &&
        !returnStopRef.current &&
        t - lastInteractionAtRef.current >= LOCATE_RESUME_DELAY_MS &&
        !(freePanRef.current && !destinationRef.current) &&
        !map.isMoving(); // another camera move (or a hand) has it; the loop glides back once it ends
      if (!canFollow) {
        following = false;
      } else {
        if (!following) {
          following = true;
          blend = still ? null : { center: map.getCenter(), zoom: map.getZoom(), at: now };
          bearing = map.getBearing();
          pitch = map.getPitch();
          const p = map.getPadding();
          pad = { top: p.top ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0, right: p.right ?? 0 };
        }
        const k = (tau: number) => 1 - Math.exp(-dt / tau);
        const wantBearing = headingRef.current ?? track.heading ?? bearing;
        bearing += turn(bearing, wantBearing) * k(0.6);
        const wantPitch = threeDRef.current ? THREE_D_PITCH : 0;
        pitch += (wantPitch - pitch) * k(0.4);
        const wantPad = followPadding();
        pad = {
          top: pad.top + (wantPad.top - pad.top) * k(0.4),
          bottom: pad.bottom + (wantPad.bottom - pad.bottom) * k(0.4),
          left: pad.left + (wantPad.left - pad.left) * k(0.4),
          right: pad.right + (wantPad.right - pad.right) * k(0.4),
        };
        let zoom = followZoom();
        let center: [number, number] = [pos.lng, pos.lat];
        if (blend) {
          const u = Math.min(1, (now - blend.at) / BLEND_MS);
          const e = inOutCubic(u);
          center = [blend.center.lng + (pos.lng - blend.center.lng) * e, blend.center.lat + (pos.lat - blend.center.lat) * e];
          zoom = blend.zoom + (zoom - blend.zoom) * e;
          if (u >= 1) blend = null;
          busy = true;
        }
        map.jumpTo({ center, zoom, bearing, pitch, padding: pad });
        busy =
          busy ||
          (!still && Math.abs(turn(bearing, wantBearing)) > 0.05) ||
          Math.abs(wantPitch - pitch) > 0.05 ||
          Math.abs(wantPad.top - pad.top) > 0.5 ||
          Math.abs(wantPad.left - pad.left) > 0.5 ||
          Math.abs(followZoom() - zoom) > 0.005;
      }
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    kickFollowRef.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kickFollowRef.current();
    return () => {
      cancelAnimationFrame(raf);
      kickFollowRef.current = () => {};
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
      const at = trackRef.current.hasFix ? trackRef.current.position(Date.now()) : userLocation;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([at.lng, at.lat])
        .addTo(map);
      // Own pin always sits above convoy member pins.
      userMarkerRef.current.getElement().parentElement?.style.setProperty("z-index", "5");
    } else {
      const el = userMarkerRef.current.getElement();
      el.textContent = letter;
      el.style.background = accentColor;
      // On screen the follow loop moves it every frame, in step with the camera; hidden, it just goes there.
      if (!isVisible) userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
    kickFollowRef.current();
  }, [map, userLocation, accentColor, profile.name, isVisible]);

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
        // Positions arrive every few seconds: glide between them rather than hop.
        glideMarker(entry.marker, member.currentLng, member.currentLat);
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
          ? (cam.maxspeed ? tr("Speed camera ({0})", [cam.maxspeed]) : tr("Speed camera"))
          : cam.type === "alpr"
            ? tr("ANPR camera")
            : tr("Traffic surveillance");

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
    toast.warning(tr("{0} camera{1} on this route", [routeCameras.length, routeCameras.length === 1 ? "" : "s"]), {
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
      setNavShare({ camera: { type: cam.type, lat: cam.lat, lng: cam.lng, maxspeed: cam.maxspeed ?? undefined, at: Date.now() } });
      if (cam.type === "speed") pingSpeedCamera();
      else pingAnprCamera();
      toast.warning(
        cam.type === "speed"
          ? tr("Speed camera ahead{0}", [cam.maxspeed ? ` · ${cam.maxspeed}` : ""])
          : cam.type === "alpr"
            ? tr("ANPR camera ahead")
            : tr("Surveillance camera ahead"),
      );
    }
  }, [userLocation, routeCameras, cameras, settings.trafficCamerasEnabled]);

  // ── Card drops (Blacktop World trading cards planted on the map) ─────────
  const cardsEnabled = settings.blacktopWorldEnabled;
  // Only while the map is on screen: the overlay stays mounted when closed, and asking for nearby drops
  // behind it (through every ride) was database work nobody saw.
  const { drops, myDrops, collectDrop, placeDrop, pickUpDrop } = useCardDrops(
    cardsEnabled && isVisible ? userLocation : null,
  );
  const { addCard } = useCollectedCards();
  const { cards } = useVehicleCards();
  const [selectedStack, setSelectedStack] = useState<CardDrop[] | null>(null);
  const selectedDrop = selectedStack?.length === 1 ? selectedStack[0] : null;
  const [droppingCard, setDroppingCard] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ lat: number; lng: number } | null>(null);

  // Copy 0 is the one locked in the vault; planted copies number upward from 1.
  const placedCount = myDrops.length;
  const ledger = copyLedger(
    cards.map((c) => c.stats.totalRides),
    placedCount,
  );
  const canDropCard = cardsEnabled && !rideState.isActive && ledger.available > 0 && cards.length > 0;
  // The card that goes down is the vehicle chosen in the garage (the first card if none is).
  // Looked up only when the prompt opens: reading the garage means parsing its photos.
  const dropCard = useMemo(() => (droppingCard ? cards.find((c) => c.bike.id === getActiveBikeIdSnapshot()) : undefined) ?? cards[0] ?? null, [droppingCard, cards]);

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

  // Card drops, drawn by the map like hazard pins (same zoom rule) — home map
  // only, so ride navigation stays clean.
  const cardStacksRef = useRef<Map<string, CardDrop[]>>(new Map());
  useEffect(() => {
    if (!map) return;
    let remove: (() => void) | null = null;
    const cancel = whenStyleReady(map, () => {
      try {
        remove = addCardDropLayer(map, (key) => {
          const stack = cardStacksRef.current.get(key);
          if (!stack) return;
          lastInteractionAtRef.current = Date.now();
          setPin(null);
          setSelectedStack(stack);
        });
      } catch (err) {
        if (/not done loading/i.test(String((err as Error)?.message ?? err))) throw err;
        console.warn("[BlacktopMap] Card drops unavailable:", err);
      }
    });
    return () => {
      cancel();
      remove?.();
    };
  }, [map]);
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => {
      const byKey = new Map<string, CardDrop[]>();
      const pins: CardPin[] = [];
      if (cardsEnabled && !rideState.isActive) {
        cardStacks.forEach((stack) => {
          const head = stack[0];
          const count = stack.length;
          const allCollected = stack.every((d) => d.collected || d.isOwn);
          // Hot-spot heat: more cards stacked here, hotter the landmark reads.
          const heat = count >= 5 ? 3 : count >= 3 ? 2 : count >= 2 ? 1 : 0;
          const heatColor = ["", "hsl(45, 93%, 58%)", "hsl(25, 95%, 55%)", "hsl(0, 84%, 60%)"][heat];
          const green = "hsl(142, 71%, 45%)";
          const edge = allCollected ? green : heat ? heatColor : accentColor;
          const key = `${head.lat.toFixed(5)}:${head.lng.toFixed(5)}`;
          byKey.set(key, stack);
          pins.push({
            key,
            lat: head.lat,
            lng: head.lng,
            look: {
              edge,
              glow: allCollected ? { color: "hsla(142, 71%, 45%, 0.6)", size: 8 } : heat ? { color: heatColor, size: 6 + heat * 4 } : null,
              badge: allCollected ? "✓" : count > 1 ? String(count) : null,
              badgeBg: allCollected ? green : heat ? heatColor : accentColor,
              big: count > 1,
            },
          });
        });
      }
      cardStacksRef.current = byKey;
      setCardDropData(map, pins);
    });
  }, [map, cardStacks, cardsEnabled, rideState.isActive, accentColor]);

  // Plant a card: the drop lands exactly where the rider is standing.
  useEffect(() => {
    if (!droppingCard) return;
    if (!userLocation) {
      toast.error(tr("Need your location to drop a card"));
      setDroppingCard(false);
      return;
    }
    setPendingDrop({ lat: userLocation.lat, lng: userLocation.lng });
  }, [droppingCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDropCard = async () => {
    if (!pendingDrop) return;
    const card = dropCard;
    const spot = pendingDrop;
    setPendingDrop(null);
    setDroppingCard(false);
    if (!card) return;
    try {
      const photoPath = card.bike.photos?.hero ? await uploadCardPhoto(card.bike.id, card.bike.photos.hero) : null;
      await placeDrop.mutateAsync({
        card,
        lat: spot.lat,
        lng: spot.lng,
        copyIndex: placedCount + 1,
        photoPath,
      });
      toast.success(tr("Card dropped"), { description: tr("Riders nearby can now scan it.") });
    } catch {
      toast.error(tr("Couldn't drop that card"));
    }
  };

  // Rider moving (drives pin visibility and the nearby-riders ring; set further down).
  const [moving, setMoving] = useState(false);

  // ── Nearby riders (opt-in): voice-range ring + faint rider dots ─────────
  const proximity = useProximityState();
  const proxMarkersRef = useRef<Map<string, Marker>>(new Map());

  // Ring = the radius other riders need to be within to be offered a join-up.
  // A faint dashed outline only, and only while stopped and not following
  // directions: filled and pulsing it covered most of a navigation-zoom screen
  // (and the pulse kept the map redrawing all ride).
  const showProxRing = proximity.active && !moving && !guiding;
  useEffect(() => {
    if (!map) return;
    const SRC = "prox-range";
    const center = showProxRing ? userLocation : null;
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
      map.addLayer({
        id: `${SRC}-line`,
        type: "line",
        source: SRC,
        paint: { "line-color": accentColor, "line-width": 1, "line-opacity": 0.35, "line-dasharray": [2, 3] },
      });
    };
    return whenStyleReady(map, apply);
  }, [map, showProxRing, userLocation, accentColor]);

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
        glideMarker(marker, r.lng, r.lat);
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
      toast(tr("Card nearby"), {
        description: tr("{0}'s {1} — tap to go for it", [drop.ownerName, drop.vehicleName]),
        action: {
          label: tr("Go"),
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
      toast.error(tr("Need your location to scan this card"));
      return false;
    }
    if (rideState.isActive && rideState.currentSpeed > 3) {
      toast.warning(tr("Stop safely before scanning a card"));
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
        toast.success(tr("Card collected"), { description: tr("Added to your vault.") });
      }
      return true;
    } catch {
      if (!silent) toast.error(tr("Get within {0} of the card to scan it", [metresText(COLLECT_RADIUS_M)]));
      return false;
    }
  };

  const handleCollectStack = async (stack: CardDrop[]) => {
    const targets = stack.filter((d) => !d.collected && !d.isOwn);
    let got = 0;
    for (const drop of targets) {
      // One at a time: each collect writes the wallet and the drop.
      if (await handleCollectDrop(drop, true)) got += 1;
    }
    setSelectedStack(null);
    if (got > 0) {
      toast.success(got === 1 ? tr("1 card collected") : tr("{0} cards collected", [got]), {
        description: tr("Added to your vault."),
      });
    } else {
      toast.error(tr("Get within {0} of the hot-spot to scan these cards", [metresText(COLLECT_RADIUS_M)]));
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
  // Water drawn as the BLACKTOP wordmark, tinted with the accent.
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => {
      try {
        applyWaterWordmark(map, accentColor);
      } catch (err) {
        if (/not done loading/i.test(String((err as Error)?.message ?? err))) throw err;
        console.warn("[BlacktopMap] Water wordmark unavailable:", err);
      }
    });
  }, [map, accentColor]);

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
  /** The hazard card open came from the hazards quick search's list (closing it brings the list back). */
  const hazardFromListRef = useRef(false);
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

  // ── A pin's card: the way there (drawn, with how far and how long), its hours and how dear ──
  const pinKey = pin ? pinKeyOf(pin) : null;
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const [pinRoute, setPinRoute] = useState<{ key: string; route: RouteResult | null; loading: boolean } | null>(null);
  const [pinFacts, setPinFacts] = useState<{ key: string; hours?: string; price: PriceInfo | null; stationId?: string } | null>(null);
  // A station's prices from riders who share them (lib/fuelPrices; nothing without the server side).
  const pinStationId = pin?.stationId ?? (pinFacts?.key === pinKey ? pinFacts?.stationId : undefined);
  const pinPrices = useStationPrices(pinStationId ? [pinStationId] : []).get(pinStationId ?? '');
  /** The card waits for the camera when it flies there from the list; a pin tapped on the map has it at once. */
  const [pinArrived, setPinArrived] = useState(false);
  const [pinHoursOpen, setPinHoursOpen] = useState(false);
  useEffect(() => {
    setPinHoursOpen(false);
    const target = pinRef.current;
    if (!target || !pinKey) {
      setPinRoute(null);
      return;
    }
    const from = userLocationRef.current;
    if (!from) {
      setPinRoute({ key: pinKey, route: null, loading: false });
      return;
    }
    let live = true;
    setPinRoute({ key: pinKey, route: null, loading: true });
    void fetchRouteThroughStops([from, { lat: target.lat, lng: target.lng }], { quiet: true }).then((route) => {
      if (live) setPinRoute({ key: pinKey, route, loading: false });
    });
    return () => {
      live = false;
    };
  }, [pinKey]);
  // A place tapped on the basemap: its tiles carry no hours or price, so they're looked up once it's opened.
  useEffect(() => {
    const target = pinRef.current;
    if (!target || !pinKey || target.kind !== "poi" || !target.osm || target.hours !== undefined) {
      setPinFacts(null);
      return;
    }
    let live = true;
    void placeDetails(target.name, target.lat, target.lng, target.osm).then((d) => {
      if (live && d) setPinFacts({ key: pinKey, hours: d.hours, price: d.price, stationId: d.stationId });
    });
    return () => {
      live = false;
    };
  }, [pinKey]);
  // The way there on the map, dashed in the accent, under the pins.
  useEffect(() => {
    if (!map) return;
    const route = pinRoute?.route;
    if (!route) return;
    const cancel = whenStyleReady(map, () => {
      const data = { type: "Feature" as const, geometry: route.geometry, properties: {} };
      const src = map.getSource(PIN_ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        return;
      }
      map.addSource(PIN_ROUTE_SOURCE_ID, { type: "geojson", data });
      const before = ["bt-cat", "bt-mine", "bt-poi"].find((id) => map.getLayer(id));
      map.addLayer(
        { id: PIN_ROUTE_CASING_ID, type: "line", source: PIN_ROUTE_SOURCE_ID, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#000000", "line-opacity": 0.45, "line-width": 7 } },
        before,
      );
      map.addLayer(
        { id: PIN_ROUTE_LINE_ID, type: "line", source: PIN_ROUTE_SOURCE_ID, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": accentColor, "line-width": 3.5, "line-dasharray": [1.4, 1.1] } },
        before,
      );
    });
    return () => {
      cancel();
      for (const id of [PIN_ROUTE_LINE_ID, PIN_ROUTE_CASING_ID]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(PIN_ROUTE_SOURCE_ID)) map.removeSource(PIN_ROUTE_SOURCE_ID);
    };
  }, [map, pinRoute, accentColor]);

  // Tapped pin: in to it, tilting to a third-person view, and circling it without
  // a pause. Picked from the list: the switch camera (lib/switchCamera: three
  // jumps up into a haze in the second accent, else the accent, across high
  // above, three jumps down onto the place), landing in the orbit with its turn
  // already going. Every frame is one camera on one timeline, so the orbit
  // carries on from the landing at its own speed, centred on the place. Where the
  // camera was, and whether it was on the rider, is kept for Back (exitOrbit).
  // Touching the map stops wherever it's got to and puts the card up; Back /
  // Navigate end the orbit.
  useEffect(() => {
    const target = pinRef.current;
    if (!map || !target || !isVisible) return; // hidden: no circling in the background
    if (!preOrbitCameraRef.current) {
      const c = map.getCenter();
      const loc = userLocationRef.current;
      // On the rider: following them (not panned away), the camera over them.
      const onRider = !!loc && !freePanRef.current && haversineM(c.lat, c.lng, loc.lat, loc.lng) < 150;
      preOrbitCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), onRider };
    }
    returnStopRef.current?.();
    returnStopRef.current = null;
    orbitingRef.current = true;
    // The place goes in the middle of the screen, not where the follow view keeps the rider.
    dropFollowPadding(map);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || isThermal();
    const haze = switchHazeRef.current;
    const spot: [number, number] = [target.lng, target.lat];
    const GROUND = Math.max(16.8, Math.min(map.getZoom(), 18));
    let raf = 0;
    let stopLegs: (() => void) | null = null;
    const alive = () => orbitingRef.current;

    /** Circle the place for as long as the card is up, carrying on from the bearing the landing left. */
    const orbit = () => {
      setPinArrived(true);
      let last = 0;
      let bearing = map.getBearing();
      const spin = (now: number) => {
        // Back / Navigate end the orbit before React tears this down: a late
        // frame here would cancel the camera move they just started.
        if (!orbitingRef.current) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        bearing = (bearing + dt * ORBIT_DEG_PER_S) % 360;
        map.jumpTo({ center: spot, bearing });
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    };

    if (reduce) {
      setPinArrived(true);
      map.jumpTo({ center: spot, zoom: GROUND, pitch: 60 });
    } else if (!target.fromList) {
      // A pin tapped on the map: straight in, the orbit winding up on the way.
      stopLegs = playLegs(
        map,
        [{ ms: 1200, to: { center: spot, zoom: GROUND, bearing: map.getBearing(), pitch: 60 }, ease: inOutCubic, spinIn: ORBIT_DEG_PER_S }],
        { high: null, ground: GROUND, haze, alive, onDone: orbit },
      );
    } else {
      setPinArrived(false);
      const { legs, high } = switchLegs(map, { center: spot, zoom: GROUND, bearing: 0, pitch: 60 }, { orbit: ORBIT_DEG_PER_S });
      stopLegs = playLegs(map, legs, { high, ground: GROUND, haze, alive, onDone: orbit });
    }
    const stopSpin = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return; // our own camera moves
      cancelAnimationFrame(raf);
      stopLegs?.();
      setPinArrived(true); // a hand on the map: stop where it's got to, card up
    };
    const events = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;
    events.forEach((ev) => map.on(ev, stopSpin));
    return () => {
      cancelAnimationFrame(raf);
      stopLegs?.();
      events.forEach((ev) => map.off(ev, stopSpin));
    };
  }, [map, pinKey, isVisible]);

  // The camera has weight. Panning by hand sways the map the way it's dragged:
  // the drag's speed is averaged (so the lean turns smoothly as a finger
  // circles). While guiding, the ride does it: the camera swings into a bend by
  // how hard it's being taken (turn rate times speed, the sideways G) with a
  // little bank, dips under braking and lifts pulling away. Either way the tilt
  // hangs on a damped spring that lags a touch behind, carries through a change
  // of direction and settles with a slight overshoot, as a camera with some mass
  // would. A few degrees of 3D tilt on the canvas alone (its container, which
  // MapLibre reads the finger from, stays put, so the drag stays under it). Only
  // a transform; it runs on its own frames while guiding with the map on screen,
  // otherwise only while it moves, and is cleared once still.
  const navSway = guiding && isVisible;
  useEffect(() => {
    if (!map || isThermal() || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = map.getCanvas();
    const MAX = 3; // degrees
    const STIFF = 55; // spring (1/s²): how hard the tilt is pulled towards the lean
    const DAMP = 2 * Math.sqrt(STIFF) * 0.72; // a little under critical: one soft overshoot
    /** The finger's speed, averaged (px per ms). */
    let vel = { x: 0, y: 0 };
    /** The tilt (degrees) and how fast it's moving. */
    let tilt = { x: 0, y: 0 };
    let spin = { x: 0, y: 0 };
    let last: { x: number; y: number; t: number } | null = null;
    let raf = 0;
    let prev = 0;
    /** Bank (degrees about the screen's middle), on its own lighter spring. */
    let roll = 0;
    let rollSpin = 0;
    let bearingWas: number | null = null;
    let yawRate = 0;
    /** What the ride asks of the camera: only while following (not panned away, not round a pin). */
    const fromRide = (dt: number) => {
      if (!navSway || orbitingRef.current || Date.now() - lastInteractionAtRef.current < LOCATE_RESUME_DELAY_MS) {
        bearingWas = null;
        yawRate *= Math.exp(-dt * 6);
        return { x: 0, y: 0, roll: 0 };
      }
      const b = map.getBearing();
      const raw = bearingWas == null || dt <= 0 ? 0 : (((b - bearingWas + 540) % 360) - 180) / dt;
      bearingWas = b;
      yawRate += (Math.max(-120, Math.min(120, raw)) - yawRate) * Math.min(1, dt * 6); // deg/s, smoothed
      const { speed, accel } = motionRef.current;
      const sideG = (speed * yawRate * (Math.PI / 180)) / 9.81; // the bend's sideways G
      return {
        // Braking (accel < 0) tips the top away: the nose dips.
        x: clamp(-accel * 0.9),
        // Swung towards the inside of the bend, up to the limit at about half a G.
        y: clamp(sideG * 6),
        roll: Math.max(-2.5, Math.min(2.5, sideG * 5)),
      };
    };
    const pointOf = (ev: unknown) => {
      const t = (ev as TouchEvent).touches?.[0] ?? (ev as TouchEvent).changedTouches?.[0];
      const p = t ?? (ev as MouseEvent);
      return typeof p?.clientX === "number" ? { x: p.clientX, y: p.clientY } : null;
    };
    const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));
    const frame = (now: number) => {
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60;
      prev = now;
      // A finger that stops, or lets go, lets the speed die away (quicker once let go).
      const fade = Math.exp(-dt * (last ? 5 : 9));
      vel = { x: vel.x * fade, y: vel.y * fade };
      // The side the map is pulled towards dips away, as a camera swinging after it would see.
      const ride = fromRide(dt);
      const want = { x: clamp(-vel.y * 4 + ride.x), y: clamp(vel.x * 4 + ride.y) };
      rollSpin += (STIFF * 0.6 * (ride.roll - roll) - DAMP * 0.8 * rollSpin) * dt;
      roll += rollSpin * dt;
      spin = {
        x: spin.x + (STIFF * (want.x - tilt.x) - DAMP * spin.x) * dt,
        y: spin.y + (STIFF * (want.y - tilt.y) - DAMP * spin.y) * dt,
      };
      tilt = { x: tilt.x + spin.x * dt, y: tilt.y + spin.y * dt };
      const still =
        !navSway &&
        !last &&
        Math.abs(roll) < 0.01 &&
        Math.hypot(tilt.x, tilt.y) < 0.01 &&
        Math.hypot(spin.x, spin.y) < 0.02 &&
        Math.hypot(vel.x, vel.y) < 0.005;
      if (still) {
        canvas.style.transform = "";
        tilt = spin = vel = { x: 0, y: 0 };
        roll = rollSpin = 0;
        raf = 0;
        prev = 0;
        return;
      }
      const lean = Math.min(1, (Math.hypot(tilt.x, tilt.y) + Math.abs(roll)) / MAX);
      canvas.style.transform = `perspective(1400px) rotateX(${tilt.x.toFixed(3)}deg) rotateY(${tilt.y.toFixed(3)}deg) rotateZ(${roll.toFixed(3)}deg) scale(${(1 + 0.045 * Math.min(1, lean)).toFixed(4)})`;
      raf = requestAnimationFrame(frame);
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onDrag = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent || orbitingRef.current) return;
      const p = pointOf(e.originalEvent);
      if (!p) return;
      const t = performance.now();
      if (last && t > last.t) {
        const dt = Math.max(8, t - last.t);
        // Averaged over the last few moves: one jumpy event can't kick the camera.
        const k = 0.3;
        vel = { x: vel.x + ((p.x - last.x) / dt - vel.x) * k, y: vel.y + ((p.y - last.y) / dt - vel.y) * k };
        run();
      }
      last = { ...p, t };
    };
    const onStart = () => {
      last = null;
    };
    const onEnd = () => {
      last = null;
      run();
    };
    map.on("dragstart", onStart);
    map.on("drag", onDrag);
    map.on("dragend", onEnd);
    if (navSway) run();
    return () => {
      map.off("dragstart", onStart);
      map.off("drag", onDrag);
      map.off("dragend", onEnd);
      cancelAnimationFrame(raf);
      canvas.style.transform = "";
    };
  }, [map, navSway]);

  // A hand on the map stops the switch back where it's got to.
  useEffect(() => {
    if (!map) return;
    const stop = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) returnStopRef.current?.();
    };
    const events = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;
    events.forEach((ev) => map.on(ev, stop));
    return () => events.forEach((ev) => map.off(ev, stop));
  }, [map]);

  /**
   * Leave the orbit. Navigate goes straight to the rider in the follow view,
   * ready to guide (one camera move: an overview first and a follow later fought
   * each other and bounced). Back depends on where the orbit started:
   * - on the rider (following them, then a pin or a list pick): the switch camera
   *   back onto them, landing in the follow view, and following carries on;
   * - a list pick from anywhere else (a quick search's overview, a spot panned
   *   to): the switch back to that view, and the list comes back;
   * - a pin tapped after panning away: it just lets go where it is, the tilt
   *   easing back, so the rider can carry on panning.
   */
  const exitOrbit = (restore: boolean) => {
    const saved = preOrbitCameraRef.current;
    const fromList = !!pin?.fromList;
    preOrbitCameraRef.current = null;
    orbitingRef.current = false;
    setPin(null);
    setPinArrived(false);
    if (!map) return;
    if (restore) {
      lastInteractionAtRef.current = Date.now();
      // From the list: the same list to pick from again.
      if (fromList) setSearchReopenSeq((n) => n + 1);
      const loc = userLocationRef.current;
      const toRider = !!saved?.onRider && !!loc && !(fromList && quickUpRef.current);
      if (!saved || (!fromList && !toRider)) {
        // Panned away and tapped a pin there: let go where it is.
        map.easeTo({ pitch: saved?.pitch ?? (threeDRef.current ? THREE_D_PITCH : 0), duration: 500, essential: true });
        return;
      }
      const to: Cam = toRider
        ? { center: [loc!.lng, loc!.lat], zoom: followZoom(), bearing: safeBearing(headingRef.current, map), pitch: threeDRef.current ? THREE_D_PITCH : 0, padding: followPadding() }
        : { center: saved.center, zoom: saved.zoom, bearing: saved.bearing, pitch: saved.pitch };
      const landed = () => {
        returnStopRef.current = null;
        if (toRider) {
          // Following again, from where the switch put the camera.
          freePanRef.current = false;
          lastInteractionAtRef.current = Date.now() - LOCATE_RESUME_DELAY_MS; // follow now, and still a touch for the idle auto-close (0 closed the map)
        } else {
          lastInteractionAtRef.current = Date.now();
        }
      };
      returnStopRef.current?.();
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || isThermal()) {
        map.easeTo({ ...to, duration: 0 });
        landed();
        return;
      }
      let stopped = false;
      const { legs, high } = switchLegs(map, to);
      const stop = playLegs(map, legs, {
        high,
        ground: to.zoom,
        haze: switchHazeRef.current,
        alive: () => !stopped && !orbitingRef.current,
        onDone: landed,
      });
      returnStopRef.current = () => {
        stopped = true;
        stop();
        returnStopRef.current = null;
        lastInteractionAtRef.current = Date.now();
      };
      return;
    }
    returnStopRef.current?.();
    followRider();
  };

  // Recentre with the rider far off screen: the switch camera onto them (the
  // follow view, at the guiding zoom with a route, the follow zoom without),
  // then following carries on. Close by (or with less motion asked for) the
  // locate button does what it always did.
  switchHomeRef.current = (landed: () => void) => {
    const loc = userLocationRef.current;
    if (!map || !loc || orbitingRef.current) return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || isThermal()) return false;
    const c = map.getCenter();
    if (haversineM(c.lat, c.lng, loc.lat, loc.lng) < 250) return false;
    returnStopRef.current?.();
    const to: Cam = {
      center: [loc.lng, loc.lat],
      zoom: followZoom(),
      bearing: safeBearing(headingRef.current, map),
      pitch: threeDRef.current ? THREE_D_PITCH : 0,
      padding: followPadding(),
    };
    let stopped = false;
    const { legs, high } = switchLegs(map, to);
    const stop = playLegs(map, legs, {
      high,
      ground: to.zoom,
      haze: switchHazeRef.current,
      alive: () => !stopped && !orbitingRef.current,
      onDone: () => {
        returnStopRef.current = null;
        freePanRef.current = false;
        lastInteractionAtRef.current = Date.now() - LOCATE_RESUME_DELAY_MS; // follow now, and still a touch for the idle auto-close (0 closed the map)
        landed();
      },
    });
    returnStopRef.current = () => {
      stopped = true;
      stop();
      returnStopRef.current = null;
      lastInteractionAtRef.current = Date.now();
    };
    return true;
  };

  /** Hand the camera to GPS follow now, centred on the rider at the guiding zoom. */
  const followRider = () => {
    const loc = userLocationRef.current;
    if (!map || !loc) return false;
    lastInteractionAtRef.current = Date.now() - LOCATE_RESUME_DELAY_MS; // follow now, and still a touch for the idle auto-close (0 closed the map)
    freePanRef.current = false;
    map.stop();
    // The follow loop glides from wherever the camera is back over the rider.
    kickFollowRef.current();
    return true;
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
  // Failed requests back off (15 s, 30 s, 1 min, then every 2 min) rather than
  // hammering a router the phone can't reach; back online, it tries at once.
  const routeFailuresRef = useRef(0);
  const routingOffline = useRoutingOffline();
  useEffect(() => {
    const onOnline = () => {
      if (!isRoutingOffline()) return;
      routeFailuresRef.current = 0;
      setRerouteTick((t) => t + 1);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
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
          routeFailuresRef.current = 0;
          routeKeyRef.current = routeKey;
          setRoute(result);
        } else {
          // Keep whatever line is on screen; the rider follows their GPS meanwhile.
          if (!isReroute) setRoute(null);
          const wait = Math.min(120_000, 15_000 * 2 ** routeFailuresRef.current);
          routeFailuresRef.current += 1;
          retry = window.setTimeout(() => setRerouteTick((t) => t + 1), wait);
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

  // Closing the home map ends its route and navigation (the overlay bumps
  // resetSeq; it never does during a ride or from a lobby). This component
  // stays mounted while hidden, so without it directions carried on behind
  // the home screen.
  const resetSeqRef = useRef(resetSeq);
  useEffect(() => {
    if (resetSeq === resetSeqRef.current) return;
    resetSeqRef.current = resetSeq;
    if (rideActiveRef.current) return;
    const hadRoute = !!destinationRef.current;
    stopSpeaking();
    setGuiding(false);
    setDestination(null);
    setRoute(null);
    setWeatherVia(null);
    setNavDismissed(false);
    setAddingWaypoint(false);
    setShowLoopPlanner(false);
    // Stops planned for this route go with it (a lobby's plan is left alone
    // when the home map was only looked at).
    if (hadRoute && isSolo) clearSoloRoute();
    preOrbitCameraRef.current = null;
    orbitingRef.current = false;
    freePanRef.current = false; // the next open follows the rider again
    zoomOverrideRef.current = null;
    setPin(null);
    if (map) clearCategoryPins(map);
    setSearchClearSeq((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSeq]);

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
      if (stop.name) toast.success(tr("Reached {0}", [stop.name]));
    }
  };

  const turnByTurn = useTurnByTurn({
    route,
    userLocation,
    speedMph: displaySpeed,
    active: guiding,
    voice: settings.navVoiceEnabled,
    voiceStyle: settings.navVoiceStyle ?? 'standard',
    unit: settings.distanceUnit,
    stops: navStops,
    onOffRoute: () => setRerouteTick((t) => t + 1),
    onStopReached: handleStopReached,
  });
  const navProgressNow = turnByTurn.progress;
  // The ride screen's mini map draws the route and the next turn from these (lib/navShare).
  useEffect(() => {
    setNavShare({ route: guiding && route ? (route.geometry.coordinates as Array<[number, number]>) : null });
  }, [guiding, route]);
  useEffect(() => {
    const next = guiding && !turnByTurn.arrived ? navProgressNow?.next ?? null : null;
    setNavShare({
      next: next ? { type: next.type, modifier: next.modifier ?? undefined, side: next.side } : null,
      distanceToNext: next && navProgressNow ? Math.round(navProgressNow.distanceToNext / 10) * 10 : null,
    });
  }, [guiding, turnByTurn.arrived, navProgressNow]);
  useEffect(() => () => setNavShare({ route: null, next: null, distanceToNext: null, camera: null }), []);
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
      toast.warning(minsIn > 0 ? tr("Heavy rain on your route in ~{0} min", [minsIn]) : tr("Heavy rain on your route"), {
        description: tr("{0} mm/h forecast where you'll be. Want a route around it?", [worst.mm.toFixed(1)]),
        duration: 12000,
        action: {
          label: tr("Dry route"),
          onClick: async () => {
            if (!userLocation) return;
            toast.loading(tr("Finding a drier line…"), { id: "dry-route" });
            const dry = await findDryRoute(
              userLocation,
              { lat: destination.lat, lng: destination.lng },
              isSolo ? soloRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })) : [],
              worst,
            );
            toast.dismiss("dry-route");
            if (!dry) {
              toast.error(tr("No clearer route found from here"));
              return;
            }
            setWeatherVia(dry.via);
            toast.success(dry.worstMm < HEAVY_MM ? tr("Rerouted around the weather") : tr("Best available route applied"), {
              description: tr("Worst rain on the new line: {0} mm/h", [dry.worstMm.toFixed(1)]),
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
      const centre = map.getCenter();
      const alreadyFollowing =
        !!userLocation && haversineM(centre.lat, centre.lng, userLocation.lat, userLocation.lng) < 120 && Math.abs(map.getZoom() - followZoom()) < 0.5;
      if (userLocation && !recentlyInteracted && !alreadyFollowing) {
        const camera = {
          center: [userLocation.lng, userLocation.lat] as [number, number],
          zoom: followZoom(),
          padding: followPadding(),
          bearing: safeBearing(headingRef.current, map),
          pitch: threeDRef.current ? THREE_D_PITCH : 0,
          essential: true,
        };
        // Close by (usually already on the way): a glide, not a fly-out-and-back.
        if (haversineM(centre.lat, centre.lng, userLocation.lat, userLocation.lng) < 3000) map.easeTo({ ...camera, duration: 900 });
        else map.flyTo(camera);
      }
    };

    const cancelReady = whenStyleReady(map, draw);

    return () => {
      cancelReady();
      removeRouteLayers();
    };
    // Redraw only when the route changes, not on every GPS fix; the fly-to uses the fix current at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Quick searches: every place found on the map, the camera pulled back to show them ──
  const [searchClearSeq, setSearchClearSeq] = useState(0);
  /** Bumped to bring the search list back (Back from a place picked in it). */
  const [searchReopenSeq, setSearchReopenSeq] = useState(0);
  const handleCategory = useCallback(
    (category: PlaceCategory | null, results: MapSearchResult[], padding: FitPadding) => {
      if (!map) return;
      if (!category || !results.length) {
        quickUpRef.current = false;
        clearCategoryPins(map);
        return;
      }
      quickUpRef.current = true;
      void showCategoryPins(map, category, results);
      // From the rider out to the nearest dozen: they're all there to pick from, and the camera stays put (locate re-centres).
      const loc = userLocationRef.current;
      const bounds = new maplibregl.LngLatBounds();
      if (loc) bounds.extend([loc.lng, loc.lat]);
      for (const r of results.slice(0, 12)) bounds.extend([r.lng, r.lat]);
      lastInteractionAtRef.current = Date.now();
      if (!destinationRef.current) freePanRef.current = true;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      dropFollowPadding(map);
      map.fitBounds(bounds, { padding, maxZoom: 15.5, pitch: 0, bearing: 0, duration: reduce ? 0 : 1200, essential: true });
    },
    [map],
  );
  /**
   * A place picked from the search list is looked at before it's ridden to:
   * the camera flies along the way there and circles it, and its card has how
   * far, how long, whether it's open and Navigate.
   */
  const handlePreview = useCallback((result: MapSearchResult, category: string) => {
    lastInteractionAtRef.current = Date.now();
    const saved = result.id.startsWith("poi:");
    setPin({
      name: result.name,
      category,
      kind: saved ? "saved" : "poi",
      id: saved ? result.id.slice(4) : undefined,
      address: result.address,
      lat: result.lat,
      lng: result.lng,
      hours: result.hours,
      price: result.price,
      stationId: result.id.startsWith("op:") ? result.id : undefined,
      fromList: true,
    });
  }, []);

  /**
   * Navigate from the orbit card, Twisty or Direct. Twisty asks the planner for its bends first (the card waits,
   * the button spinning) and rides them as "Twisty leg" stops before the place, as the lobbies do; with none to
   * be had it says so and goes direct. Either way a twisty pick before it is dropped from the solo route.
   */
  const [styleBusy, setStyleBusy] = useState<RouteStyle | null>(null);
  const navigateWith = async (style: RouteStyle) => {
    const target = pin;
    if (!target || styleBusy) return;
    const here = userLocationRef.current;
    const kept = isSolo ? soloRoute.stops.filter((s) => !isTwistyLeg(s.name)) : [];
    let vias: { lat: number; lng: number }[] | null = null;
    if (style === "twisty" && here) {
      setStyleBusy("twisty");
      vias = await routeStyleVias("twisty", [here, ...kept, target]);
      setStyleBusy(null);
      if (pinRef.current !== target) return; // the card was closed or changed meanwhile
      if (!vias) toast(tr("No twistier way there, so it's the direct one"));
    }
    if (target.fromList && target.kind !== "saved") {
      saveRecentLocation({ id: `pin:${target.lat.toFixed(5)},${target.lng.toFixed(5)}`, name: target.name, address: target.address || target.category, lat: target.lat, lng: target.lng });
    }
    const dest = { lat: target.lat, lng: target.lng, name: target.name, address: target.address || target.category };
    if (isSolo) setSoloRoute({ destination: dest, stops: [...kept, ...twistyLegs(vias)] });
    else for (const leg of twistyLegs(vias)) await addWaypoint({ ...leg, address: "" });
    exitOrbit(false);
    handleSearchSelect({ id: target.id ?? `pin:${target.lat.toFixed(5)},${target.lng.toFixed(5)}`, ...dest }, { follow: true });
  };

  const handleSearchSelect = (result: MapSearchResult, opts: { follow?: boolean } = {}) => {
    // A route or a stop from here on: a quick search's pins have done their job.
    quickUpRef.current = false;
    if (map) clearCategoryPins(map);
    setSearchClearSeq((n) => n + 1);
    // A what3words suggestion: find where it is first.
    if (result.id.startsWith(W3W_RESULT_PREFIX)) {
      void resolveWhat3WordsResult(result).then((found) =>
        found ? handleSearchSelect(found, opts) : toast.error(tr("Couldn't find that what3words address")),
      );
      return;
    }
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
    // Navigate from a pin: the camera is already on its way to the rider.
    if (opts.follow && userLocationRef.current) return;
    lastInteractionAtRef.current = Date.now();

    if (map) {
      if (userLocation) {
        const bounds = new maplibregl.LngLatBounds(
          [userLocation.lng, userLocation.lat],
          [userLocation.lng, userLocation.lat],
        );
        bounds.extend([result.lng, result.lat]);
        dropFollowPadding(map);
        map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1500 });
      } else {
        dropFollowPadding(map);
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
      toast(tr("Navigation ended"));
    } else {
      toast(tr("Directions off"), { description: tr("The route stays on the map for your convoy.") });
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
    toast.success(tr("Route finished"));
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
          <PixelLoader className="w-5 h-5" />
          {tr("Refreshing map…")}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="blacktop-maplibre absolute inset-0 w-full h-full" />
      <div ref={switchHazeRef} aria-hidden className="map-switch-haze" />
      {settings.parkedSpotEnabled && <ParkedSpotPin map={map} hidden={rideState.isActive} rider={userLocation} />}

      {/* First-time tips: a walk along the toolbar and the controls, so more than the usual three.
          Only with the map open and at rest: never on a ride or while guiding. */}
      {isVisible && (
        <PageTips
          page="map"
          max={13}
          when={!rideState.isActive && !guiding && showSearchBar && !droppingCard && !showLoopPlanner && !showOfflinePacks}
          tips={[
            { target: '[data-tip="map-search"]', text: tr("Search for a place, pick a result, then tap Go for turn-by-turn directions.") },
            { target: '[data-tip="map-report"]', text: tr("Spotted something? Report a hazard here. Riders coming up behind get a warning.") },
            { target: '[data-tip="map-dark"]', text: tr("The dark map: Blacktop's own look.") },
            { target: '[data-tip="map-satellite"]', text: tr("Satellite view, for seeing the road and what's around it.") },
            { target: '[data-tip="map-3d"]', text: tr("3D terrain and buildings, for hills and passes.") },
            { target: '[data-tip="map-loop"]', text: tr("The loop planner builds a round trip from where you are. Pick a length and a style: Twisty, Scenic or Relaxed.") },
            { target: '[data-tip="map-offline"]', text: tr("Download the map for an area, so it still draws with no signal.") },
            { target: '[data-tip="radio"]', text: tr("Blacktop Radio. Tap to play or pause; hold for the station dial.") },
            { target: '[data-tip="map-drop"]', text: tr("Plant a spare copy of your card on the map for other riders to find.") },
            { target: '[data-tip="map-save"]', text: tr("Save where you are now as a place, to find or navigate to later.") },
            { target: '[data-tip="handshake"]', text: tr("Riders nearby who have opted in show up here. Tap to invite them to ride with you.") },
            { target: '.blacktop-maplibre .bt-alarm-ctrl', text: tr("This arms the anti-theft alarm: the same lock as on Home.") },
            { target: '.blacktop-maplibre .maplibregl-ctrl-compass', text: tr("Tap the compass to turn the map north-up again. The locate button brings the map back to you.") },
          ]}
        />
      )}
      {/* Its own set, the first time a place's card is up. */}
      {isVisible && (
        <PageTips
          page="map-place"
          when={!!pin && pinArrived}
          tips={[{ target: '[data-tip="orbit-twisty"]', text: tr("Twisty takes the bendy roads there, Direct the quickest way. Both start guiding straight away.") }]}
        />
      )}
      {/* Its own set, the first time the hazards near the rider are listed (from Blacktop Console). */}
      {isVisible && (
        <PageTips
          page="map-hazards"
          when={!rideState.isActive && !guiding && showSearchBar}
          tips={[{ target: '[data-chip="hazards"]', text: tr("These are the hazards riders reported near you. Tap one to see it, or tap Hazards to go back to the map.") }]}
        />
      )}
      {/* The speed limit sign on the speed card: its own set, once one is up and the rider has stopped. */}
      {isVisible && speedLimit && settings.speedFocusEnabled && (
        <PageTips
          page="map-speedlimit"
          when={displaySpeed < 3 && !droppingCard && !showLoopPlanner && !showOfflinePacks}
          tips={[{ target: '[data-tip="speed-limit"]', text: settings.speedLimitColours !== false ? tr("The road's speed limit, from OpenStreetMap. Your speed turns amber over it and red at 10 % over. It can be out of date, so the signs on the road come first.") : tr("The road's speed limit, from OpenStreetMap. It can be out of date, so the signs on the road come first.") }]}
        />
      )}
      {/* Its own set, shown once there's a parked spot on the map. */}
      {isVisible && (
        <PageTips
          page="map-parked"
          when={!rideState.isActive && !guiding && showSearchBar && !droppingCard && !showLoopPlanner && !showOfflinePacks}
          tips={[{ target: '[data-tip="parked"]', text: tr("Where you parked after your last ride. Tap it for the floor and bay, and walking directions back.") }]}
        />
      )}

      {/* Top-left column, left of the MapLibre controls: the top slot (search
          bar, or the convoy strip while riding in a convoy) with the toolbar
          flowing underneath, so when the search bar steps aside while moving
          the toolbar slides up into its place. */}
      <div className="absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(0.75rem+var(--safe-left))] right-[calc(4.25rem+var(--safe-right))] short:right-auto short:w-[22rem] short:gap-1.5 z-30 flex flex-col items-start gap-2 pointer-events-none">
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
              spread={etaSpread(route)}
              onStop={handleStopNavigating}
              onShareEta={async () => {
                if (!navProgressNow) return;
                const left = shortDistance(navProgressNow.remainingMeters, settings.distanceUnit);
                const away = `${left.value} ${left.unit}`;
                const eta = etaClock(navProgressNow.remainingSeconds, etaSpread(route));
                const where = destination?.name;
                const text = !where
                  ? tr("On my way. {0} to go, ETA {1}.", [away, eta])
                  : terms.car
                    ? tr("Driving to {0}. {1} to go, ETA {2}.", [where, away, eta])
                    : tr("Riding to {0}. {1} to go, ETA {2}.", [where, away, eta]);
                const r = await shareText(text);
                if (r === 'copied') toast.success(tr("ETA copied. Paste it into a message."));
                else if (r === 'failed') toast.error(tr("Couldn't share your ETA"));
              }}
              handOff={
                destination && profile.preferredNavApp !== 'blacktop'
                  ? {
                      label: navAppLabel(profile.preferredNavApp),
                      onOpen: () => openInNavApp(profile.preferredNavApp as Exclude<typeof profile.preferredNavApp, 'blacktop'>, destination.lat, destination.lng, destination.name),
                    }
                  : undefined
              }
              onSkip={
                canSkipWaypoint
                  ? async () => {
                      await completeWaypoint(nextWaypoint!.id);
                      toast.success(tr("Stop skipped"));
                    }
                  : undefined
              }
            />
            {/* Router out of reach: calm and non-blocking; the line stays and retries back off. */}
            {routingOffline && (
              <div role="status" className="mt-1.5 mx-auto w-fit flex items-center gap-1.5 rounded-full frost-accent px-3 py-1.5 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5" aria-hidden />
                {tr("Offline — following GPS track")}
              </div>
            )}
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
                    address: d.collected ? tr("Card · collected") : tr("Trading card drop"),
                    lat: d.lat,
                    lng: d.lng,
                  }))
                : undefined
            }
            onSelect={handleSearchSelect}
            onCategory={handleCategory}
            onPreview={handlePreview}
            onHazards={(found, padding) => {
              if (!map) return;
              const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
              if (!found) {
                // Back out: the reports' card goes and the camera goes back to following the rider.
                hazardFromListRef.current = false;
                setHazardId(null);
                if (!followRider()) freePanRef.current = false;
                return;
              }
              // The rider and every report near them in view, as a quick search does with its places.
              const loc = userLocationRef.current;
              const bounds = new maplibregl.LngLatBounds();
              if (loc) bounds.extend([loc.lng, loc.lat]);
              for (const r of found) bounds.extend([r.lng, r.lat]);
              if (bounds.isEmpty()) return;
              lastInteractionAtRef.current = Date.now();
              if (!destinationRef.current) freePanRef.current = true;
              dropFollowPadding(map);
              map.fitBounds(bounds, { padding, maxZoom: 15, pitch: 0, bearing: 0, duration: reduce ? 0 : 1200, essential: true });
            }}
            onHazardPick={(id) => {
              const h = hazards.find((x) => x.id === id);
              if (!map || !h) return;
              setHazardId(id);
              hazardFromListRef.current = true;
              lastInteractionAtRef.current = Date.now();
              freePanRef.current = true;
              dropFollowPadding(map);
              map.easeTo({ center: [h.lng, h.lat], zoom: Math.max(map.getZoom(), 15), duration: 900, essential: true });
            }}
            onRoute={(r) => {
              // A saved route loads as an imported GPX route does: its start and stops on the way, its end the destination.
              quickUpRef.current = false;
              if (map) clearCategoryPins(map);
              // With stops it's a trip: an unfinished one carries on from its next leg (ride/lib/trips).
              const plan = chooseRouteTrip(r);
              setSoloRoute({ destination: plan.destination, stops: plan.stops });
              setDestination({ lat: plan.destination.lat, lng: plan.destination.lng, name: plan.destination.name, address: plan.destination.address });
              toast.success(tr("Route loaded · {0}", [r.name]), plan.trip ? { description: tr("Leg {0} of {1}", [plan.trip.legsDone + 1, plan.trip.points.length - 1]) } : undefined);
            }}
            clearSeq={searchClearSeq}
            reopenSeq={searchReopenSeq}
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
                      <span className="font-semibold">{tr("Rescue requested")}</span>{" "}{tr("· your convoy has your location")}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{rescueTarget.userName || tr("A rider")}{" "}{tr("needs help")}</span>
                      {rescueRoute
                        ? ` · ${formatDistance(metersToMiles(rescueRoute.distanceMeters), settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)} · ${formatDuration(Math.round(rescueRoute.durationSeconds))}`
                        : tr(" · route on map")}
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
              etaSpread={etaSpread(route)}
              speedUnit={settings.speedUnit}
            />
          </div>
        )}

      <div className="flex flex-row flex-wrap landscape:flex-nowrap items-start gap-2 pointer-events-auto">
        <div className="flex flex-row flex-wrap landscape:flex-nowrap items-center max-w-[calc(100vw-5rem)] landscape:max-w-none rounded-xl overflow-hidden border border-border shadow-lg bg-card/95 backdrop-blur">
          <button
            type="button"
            onClick={() => setBasemap("dark")}
            aria-pressed={basemap === "dark"}
            aria-label={tr("Dark map")}
            data-tip="map-dark"
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
            aria-label={tr("Satellite view")}
            data-tip="map-satellite"
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
            aria-label={tr("3D terrain and buildings")}
            data-tip="map-3d"
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
            aria-label={tr("Plan a loop ride")}
            data-tip="map-loop"
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
            aria-label={tr("Offline maps")}
            data-tip="map-offline"
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
                aria-label={tr("Drop a trading card on the map")}
                data-tip="map-drop"
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
              <p className="text-xs font-semibold text-foreground">{tr("Name this spot")}</p>
              <Input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={tr("e.g. Home, Camp spot…")}
                className="h-9 text-sm bg-background/60"
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveName.trim() && userLocation) {
                    savePOI({ name: saveName.trim(), lat: userLocation.lat, lng: userLocation.lng });
                    toast.success(tr("\"{0}\" saved", [saveName.trim()]));
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
                    toast.success(tr("\"{0}\" saved", [saveName.trim()]));
                    setSaveName("");
                    setShowSaveUI(false);
                  }}
                  className="flex-1 h-8 text-xs"
                >
                  {tr("Save")}
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
                  {tr("Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!userLocation) {
                  toast.info(tr("Waiting for GPS fix…"));
                  return;
                }
                setSaveName("");
                setShowSaveUI(true);
              }}
              className="w-[38px] h-[38px] landscape:w-[34px] landscape:h-[34px] flex items-center justify-center rounded-xl bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors"
              aria-label={tr("Save current location as a POI")}
              data-tip="map-save"
            >
              <BookmarkPlus className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
            </button>
          )}
        </div>

        {/* Nearby riders (opt-in): between save-location and the MapLibre controls. */}
        <HandshakeButton convoy={convoy} placement="down" />

        {/* Rescue: held, then asked; out of the way of Report and the close button. In
            portrait always on its own line under the toolbar's left end (the row has no room
            for it once nearby riders shows, and it shouldn't move about); in landscape at the
            row's end. */}
        <div className="basis-full landscape:basis-auto flex">
          <MapRescueButton isLeader={!!convoy.isLeader} />
        </div>
      </div>
      </div>

      {droppingCard && dropCard && (
        <CardDropPrompt
          card={dropCard}
          left={ledger.available}
          ready={!!pendingDrop}
          onYes={() => void confirmDropCard()}
          onNo={() => {
            setPendingDrop(null);
            setDroppingCard(false);
          }}
        />
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
              name: tr("Loop point {0}", [i + 1]),
            }));
            setSoloRoute({
              destination: { lat: userLocation.lat, lng: userLocation.lng, name: tr("Loop finish") },
              stops: vias,
            });
            setDestination({ lat: userLocation.lat, lng: userLocation.lng, name: tr("Loop finish") });
            setShowLoopPlanner(false);
            toast.success(
              tr("Loop ready · {0} · {1}", [formatDistance(metersToMiles(loop.distanceMeters), settings.distanceUnit), formatDuration(Math.round(loop.durationSeconds))]),
            );
          }}
        />
      )}

      {showOfflinePacks && (
        <OfflinePacksPanel
          map={map}
          onClose={() => setShowOfflinePacks(false)}
          userLocation={userLocation}
          routeCoords={destination && route ? (route.geometry.coordinates as [number, number][]) : null}
          routeName={destination?.name ?? null}
          onImportGpx={(g) => {
            setSoloRoute({ destination: g.destination, stops: g.stops });
            setDestination({ lat: g.destination.lat, lng: g.destination.lng, name: g.destination.name ?? g.name });
            toast.success(tr("GPX route loaded · {0}", [g.name]));
          }}
        />
      )}





      <div className="absolute bottom-[calc(0.75rem+var(--safe-bottom))] left-[calc(0.75rem+var(--safe-left))] right-[calc(0.75rem+var(--safe-right))] short:right-auto short:w-[22rem] z-10 space-y-1.5">
        {/* Waypoints panel — convoy context: leaders can add/remove, members can see stops */}
        {showWaypointsPanel && (
          <div className="animate-slide-up">
            {addingWaypoint ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-card/95 border border-border rounded-xl shadow-xl backdrop-blur">
                <Plus className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <p className="flex-1 text-xs text-accent">{tr("Search for a stop above…")}</p>
                <button
                  onClick={() => setAddingWaypoint(false)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  aria-label={tr("Cancel adding stop")}
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
                        <p className="flex-1 truncate text-xs">{wp.name || tr("Stop")}</p>
                        <button
                          onClick={() => removeSoloStopAt(i)}
                          className="p-1 hover:bg-muted rounded-xl transition-colors flex-shrink-0"
                          aria-label={tr("Remove stop {0}", [wp.name || i + 1])}
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
                            className="p-1 hover:bg-muted rounded-xl transition-colors flex-shrink-0"
                            aria-label={tr("Remove stop {0}", [wp.name])}
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
                    aria-label={tr("Add stop")}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {tr("Add Stop")}
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
              <p className="font-semibold text-sm truncate">{destination.name || tr("Destination")}</p>
              {isRouting ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <PixelLoader className="w-3 h-3" />{" "}{tr("Finding route...")}
                </p>
              ) : route ? (
                <p className="text-xs text-muted-foreground">
                  {formatDistance(
                    metersToMiles(guiding && navProgressNow ? navProgressNow.remainingMeters : route.distanceMeters),
                    settings.distanceUnit,
                  )}{" "}
                  {getDistanceLabel(settings.distanceUnit)}
                  {" · "}
                  {travelTime(guiding && navProgressNow ? navProgressNow.remainingSeconds : route.durationSeconds, etaSpread(route))}
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
                title={tr("Start turn-by-turn directions")}
              >
                {tr("Go")}
              </button>
            )}

            {/* Leader-only: skip current waypoint and advance to the next stop */}
            {canSkipWaypoint && (
              <button
                onClick={async () => {
                  await completeWaypoint(nextWaypoint!.id);
                  toast.success(tr("Stop skipped"));
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted hover:bg-secondary text-xs font-medium text-muted-foreground transition-colors flex-shrink-0"
                title={tr("Skip this stop and advance to the next")}
              >
                <SkipForward className="w-3.5 h-3.5" />
                {tr("Skip")}
              </button>
            )}
            {!canSkipWaypoint && canFinishRoute && (
              <button
                onClick={handleFinishRoute}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-xs font-semibold text-accent transition-colors flex-shrink-0"
                title={tr("Finish the route and clear the map")}
              >
                <Flag className="w-3.5 h-3.5" />
                {tr("Finish")}
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
                aria-label={tr("Remove destination")}
                title={tr("Remove destination")}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Landscape (short:): the speed card sits in the left-hand column, between the toolbar and Report. */}
        <div className="flex flex-col items-center short:items-start gap-1.5">
          {/* Bottom-left: Report, beside the speed card in portrait; in landscape (short:)
              the speed card goes above it, out of the way of the map. Rescue isn't here (a
              tap away from Report, it sent on one press): it's held, at the toolbar's end. */}
          <div ref={speedRowRef} className="w-full grid grid-cols-[1fr_auto_1fr] items-end gap-2 short:flex short:flex-col short:items-start short:gap-1.5">
            <div className="flex flex-col items-start gap-2 justify-self-start pointer-events-auto">
              <HazardReport
                getPosition={() => (userLocation ? { ...userLocation, heading: headingRef.current ?? null } : null)}
              />
            </div>
            {/* Show speed for active ride OR home-map preview (never saved) */}
            {(rideState.isActive || geoSpeed > 0) && (
              <div
                className={cn(
                  "relative short:order-first flex items-baseline gap-1.5 px-5 py-3 short:px-4 short:py-2 rounded-2xl bg-card/95 border shadow-lg backdrop-blur font-mono font-bold tabular-nums transition-colors",
                  speedColorClass,
                )}
              >
                <span className="text-5xl short:text-4xl leading-none">{formatSpeed(displaySpeed, settings.speedUnit)}</span>
                <span className="text-sm opacity-70">{getSpeedLabel(settings.speedUnit)}</span>
                {/* The road's limit on the card's top-right corner, as Waze does. */}
                {speedLimit && settings.speedFocusEnabled && (
                  <SpeedLimitSign limit={speedLimit} unit={settings.speedUnit} size={40} className="absolute -top-4 -right-4 short:-top-3 short:-right-3" />
                )}
              </div>
            )}
            <div aria-hidden className="short:hidden" />
          </div>

          {/* Every credit in one place: under the speed card in portrait (above it, the speed limit sign sat on the
              weather line); in landscape (short:) they move up beside the search bar (below), clear of the speed card. */}
          <div className="px-14 py-0.5 text-[10px] leading-tight text-muted-foreground/70 pointer-events-none text-center short:hidden">
            <MapCredits weather />
          </div>
        </div>
      </div>

      {/* Landscape: every credit at the top, right of the (22rem) search column and clear of the right-hand
          controls. On the narrowest phones on their side that leaves about 100 px, so there they sit at the
          bottom instead, between the speed column and the close button. */}
      <div className="hidden short:block [@media(max-width:739px)]:!hidden absolute top-[calc(0.75rem+var(--safe-top)+0.6rem)] left-[calc(0.75rem+var(--safe-left)+22.75rem)] right-[calc(var(--safe-right)+5.5rem)] z-20 pointer-events-none">
        <span className="inline-block px-2 py-0.5 rounded-md bg-background/40 text-[10px] leading-tight text-muted-foreground/80">
          <MapCredits weather />
        </span>
      </div>
      <div className="hidden short:[@media(max-width:739px)]:block absolute bottom-[calc(0.75rem+var(--safe-bottom))] left-[calc(0.75rem+var(--safe-left)+11rem)] right-[calc(var(--safe-right)+5rem)] z-20 pointer-events-none text-center">
        <span className="inline-block px-2 py-0.5 rounded-md bg-background/40 text-[10px] leading-tight text-muted-foreground/80">
          <MapCredits weather />
        </span>
      </div>

      {/* Tapped hazard: what it is, still there / gone. */}
      {tappedHazard && !pin && (
        <HazardCard
          hazard={tappedHazard}
          onClose={() => {
            setHazardId(null);
            // Picked from the hazards list: the list comes back where it was.
            if (hazardFromListRef.current) setSearchReopenSeq((n) => n + 1);
            hazardFromListRef.current = false;
          }}
          className="absolute left-[calc(0.75rem+var(--safe-left))] right-[calc(0.75rem+var(--safe-right))] bottom-[calc(0.75rem+var(--safe-bottom))] short:right-auto short:w-[22rem] z-30"
        />
      )}

      {/* Tapped pin, or a place picked from the list once the camera's there: it circles the place. The card says
          how far and how long by road, whether it's open and how dear; Back unlocks (from the list: back to the
          rider and the list), Navigate sets the route. */}
      {pin && pinArrived && (
        <div className="absolute left-[calc(0.75rem+var(--safe-left))] right-[calc(0.75rem+var(--safe-right))] bottom-[calc(0.75rem+var(--safe-bottom))] short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-3 animate-slide-up">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{pin.name}</p>
              <p className="text-xs text-muted-foreground truncate">{pin.category}</p>
              {(() => {
                const way = pinRoute?.key === pinKey ? pinRoute : null;
                const dist = (m: number) => `${formatDistance(metersToMiles(m), settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`;
                if (way?.route) {
                  const spread = etaSpread(way.route);
                  return (
                    <p className="text-xs font-medium text-foreground/90 mt-0.5 truncate">
                      {tr("{0} · {1} · ETA {2}", [
                        dist(way.route.distanceMeters),
                        travelTime(way.route.durationSeconds, spread),
                        etaClock(way.route.durationSeconds, spread),
                      ])}
                    </p>
                  );
                }
                if (!userLocation) return null;
                const straight = dist(calculateDistance(userLocation.lat, userLocation.lng, pin.lat, pin.lng) * 1000);
                return (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {way?.loading ? tr("{0} away · finding the way…", [straight]) : tr("{0} away", [straight])}
                  </p>
                );
              })()}
              {/* The place's what3words (when Blacktop has what3words). */}
              <W3WAddress lat={pin.lat} lng={pin.lng} className="mt-0.5 text-xs items-start text-left" />
            </div>
            {pin.kind === "saved" ? (
              <button
                className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (pin.id) deletePOI(pin.id);
                  toast(tr("Removed from saved places"));
                  exitOrbit(true);
                }}
                aria-label={tr("Remove from saved places")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10"
                onClick={() => {
                  const saved = savePOI({ name: pin.name, lat: pin.lat, lng: pin.lng });
                  toast.success(tr("{0} saved", [pin.name]));
                  setPin({ ...pin, kind: "saved", category: tr("Saved place"), id: saved.id });
                }}
                aria-label={tr("Save this place")}
              >
                <BookmarkPlus className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Fuel or charging prices riders reported here in the last two weeks. */}
          {pinPrices && pinPrices.length > 0 && (
            <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 space-y-0.5">
              {[...pinPrices].sort((a, b) => a.low - b.low).map((p) => (
                <div key={p.fuel} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold truncate">{fuelName(p.fuel)}</span>
                  <span className="font-mono font-semibold shrink-0">{perUnitText(p)}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">{reportsText({ ...pinPrices[0], n: pinPrices.reduce((n, p) => n + p.n, 0), latest: Math.max(...pinPrices.map((p) => p.latest)) })}</p>
            </div>
          )}
          {/* Open or shut (green / red) and how dear, with the week's hours a tap away. */}
          {(() => {
            const hours = pin.hours ?? (pinFacts?.key === pinKey ? pinFacts.hours : undefined);
            const price = pin.price ?? (pinFacts?.key === pinKey ? pinFacts.price : null);
            const status = placeStatus(hours);
            const week = hours ? parseOpeningHours(hours) : null;
            if (!status && !price) return null;
            return (
              <>
                <div className={cn("mt-2 rounded-lg px-2.5 min-h-[2.25rem] flex items-center gap-2", status ? openTint(status) : "bg-muted/40")}>
                  {status && <Clock3 className={cn("w-3.5 h-3.5 flex-shrink-0", openText(status))} />}
                  <span className={cn("text-xs font-semibold flex-1 min-w-0 truncate", status ? openText(status) : "text-muted-foreground")}>
                    {status ? status.label : tr("Hours not known")}
                  </span>
                  {price && <PriceSigns info={price} sign={currencySign(countryCode)} className="text-xs flex-shrink-0" />}
                  {week && (
                    <button
                      type="button"
                      onClick={() => setPinHoursOpen((v) => !v)}
                      aria-expanded={pinHoursOpen}
                      aria-label={tr("Opening hours")}
                      className="glove-hit -mr-1 p-1 rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className={cn("w-4 h-4 transition-transform", pinHoursOpen && "rotate-180")} />
                    </button>
                  )}
                </div>
                {pinHoursOpen && week && (
                  <ul className="mt-1.5 px-2.5 space-y-0.5 text-[11px] text-muted-foreground">
                    {weekLines(week).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => exitOrbit(true)}>
              <ArrowLeft className="w-3.5 h-3.5" />{" "}{tr("Back")}
            </Button>
            {/* Two ways there, both straight into guidance: Twisty in the accent, Direct in the second accent (white without one). */}
            <Button
              size="sm"
              disabled={!!styleBusy}
              data-tip="orbit-twisty"
              className="flex-1 gap-1 bg-accent text-accent-foreground hover:bg-accent hover:brightness-110"
              onClick={() => void navigateWith("twisty")}
            >
              {styleBusy === "twisty" ? <PixelLoader className="w-3.5 h-3.5" /> : <Waves className="w-3.5 h-3.5" />}{" "}{tr("Twisty")}
            </Button>
            <Button
              size="sm"
              disabled={!!styleBusy}
              className="flex-1 gap-1 btn-accent-2"
              onClick={() => void navigateWith("direct")}
            >
              <Navigation className="w-3.5 h-3.5" />{" "}{tr("Direct")}
            </Button>
          </div>
        </div>
      )}

      {selectedDrop && (
        <div className="absolute left-[calc(0.75rem+var(--safe-left))] right-[calc(0.75rem+var(--safe-right))] bottom-[calc(0.75rem+var(--safe-bottom))] short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setSelectedStack(null)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-secondary"
            aria-label={tr("Close card details")}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-accent" />
            <p className="text-sm font-bold truncate">{selectedDrop.vehicleName}</p>
            {selectedDrop.collected && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(142_71%_45%)]">
                <Check className="w-3 h-3" />{" "}{tr("Collected")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedDrop.ownerName} · {selectedDrop.makeModel || tr("Unknown model")} · {selectedDrop.tier}
          </p>
          {userLocation && (
            <p className="text-xs text-muted-foreground mt-1">
              {formatDistance((metersBetween(userLocation, selectedDrop) / 1000) * 0.621371, settings.distanceUnit)}{" "}
              {getDistanceLabel(settings.distanceUnit)}{" "}{tr("away")}
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
              {tr("Go for it")}
            </Button>
            {selectedDrop.isOwn ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await pickUpDrop.mutateAsync(selectedDrop.id);
                  setSelectedStack(null);
                  toast.success(tr("Card picked back up"));
                }}
              >
                {tr("Pick up")}
              </Button>
            ) : (
              !selectedDrop.collected && (
                <Button size="sm" variant="outline" onClick={() => handleCollectDrop(selectedDrop)}>
                  {tr("Scan")}
                </Button>
              )
            )}
          </div>
        </div>
      )}

      {selectedStack && selectedStack.length > 1 && (
        <div className="absolute left-[calc(0.75rem+var(--safe-left))] right-[calc(0.75rem+var(--safe-right))] bottom-[calc(0.75rem+var(--safe-bottom))] short:right-auto short:w-[22rem] z-30 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setSelectedStack(null)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-secondary"
            aria-label={tr("Close card hot-spot")}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-accent" />
            <p className="text-sm font-bold">{tr("Card hot-spot")}</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {selectedStack.length}{" "}{tr("cards")}
            </span>
          </div>
          {userLocation && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDistance((metersBetween(userLocation, selectedStack[0]) / 1000) * 0.621371, settings.distanceUnit)}{" "}
              {getDistanceLabel(settings.distanceUnit)}{" "}{tr("away")}
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
                  name: tr("Card hot-spot"),
                });
                setSelectedStack(null);
              }}
            >
              {tr("Go for it")}
            </Button>
            {selectedStack.some((d) => !d.collected && !d.isOwn) && (
              <Button size="sm" variant="outline" onClick={() => handleCollectStack(selectedStack)}>
                {tr("Collect all")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Basemap credits (MapLibre's own attribution control is hidden; see blacktopMap.css). */
/** The map's credits; `weather` adds the rain radar's and forecasts'. */
function MapCredits({ weather = false }: { weather?: boolean }) {
  return (
    <>
      ©{" "}
      <a
        href="https://openfreemap.org"
        target="_blank"
        rel="noreferrer"
        className="hover:text-muted-foreground underline-offset-2 hover:underline pointer-events-auto"
      >
        {tr("OpenFreeMap")}
      </a>{" "}
      ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="hover:text-muted-foreground underline-offset-2 hover:underline pointer-events-auto"
      >
        {tr("OpenStreetMap")}
      </a>{" "}
      {tr("contributors")}
      {weather && <> · {tr("Weather: RainViewer, Open-Meteo")}</>}
    </>
  );
}
