import { useCallback, useRef, useSyncExternalStore, useEffect } from 'react';
import { Geolocation, Position, CallbackID } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ActiveRideState, RideSession, GpsPoint } from '@/types/blacktop';
import { getActiveBikeIdSnapshot } from '@/features/garage/hooks/useGarage';
import { useRideHistory } from './useRideHistory';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SPEED_SMOOTHING_FACTOR = 0.75; // Higher = more responsive to current reading
const MIN_SPEED_THRESHOLD = 0.3; // mph - very low threshold to catch movement early
const MAX_ACCURACY_THRESHOLD = 200; // meters - accept moderately poor GPS
const MAX_SPEED_SANITY = 200; // mph - reject speeds above this
const MAX_DISTANCE_JUMP = 0.5; // miles - tighter check for GPS jumps
const CONVOY_SYNC_FAST_INTERVAL = 4000; // ms - broadcast cadence while moving
const CONVOY_SYNC_SLOW_INTERVAL = 30000; // ms - broadcast cadence while idle
const CONVOY_SYNC_BACKGROUND_INTERVAL = 45000; // ms - fallback cadence while app is backgrounded
const CONVOY_IDLE_SPEED_MPH = 15 / 1.60934; // 15 km/h, converted to mph (currentSpeed's unit)
const CONVOY_IDLE_GRACE_MS = 30000; // how long below threshold before dropping to slow cadence
const SPEED_CHANGE_THRESHOLD = 5; // mph - if speed changes more than this, reduce smoothing
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes fully stationary triggers the inactivity guard
const INACTIVITY_RADIUS_MILES = 5 / 1609.34; // "a few meters" of GPS drift still counts as stationary
const SPEED_DISTANCE_MAX_GAP_SEC = 120; // cap speed-based distance fallback across stale GPS gaps
const MIN_MOVING_SPEED_FOR_SAVE_MPH = 5;

const RIDE_STATE_KEY = 'blacktop_active_ride';

// Battery optimization: track consecutive stationary readings
let stationaryCount = 0;
const STATIONARY_THRESHOLD = 3; // Number of zero-speed readings before throttling
const THROTTLE_SKIP_COUNT = 2; // Skip this many updates when stationary (process every 3rd)

// Track stationary time for Fallback badge
let stationaryTimeSeconds = 0;
let lastStationaryCheck: number | null = null;

// Inactivity checkout guard - tracks continuous time spent at speed 0 within
// a tight GPS radius, so an unattended phone doesn't keep broadcasting (and
// racking up Realtime usage) all night.
let inactivityAnchor: { lat: number; lng: number } | null = null;
let inactivityLastCheck: number | null = null;
let inactivityStationarySeconds = 0;
let inactivityTriggered = false;

// ── Abandoned-ride watchdog ────────────────────────────────────────────────
// GPS callbacks stop firing once tracking pauses (and can dry up entirely if
// the OS suspends the app), so the stationary guard above can't be the only
// safety net. This wall-clock ticker pauses an idle ride and then auto-ends it
// so a phone left on with an active ride can't log a 75-hour session.
const AUTO_END_AFTER_PAUSE_MS = 15 * 60 * 1000; // idle-paused this long -> end + save
const MAX_RIDE_DURATION_MS = 12 * 60 * 60 * 1000; // absolute hard stop
const WATCHDOG_INTERVAL_MS = 30_000;
let lastMovementAtMs: number | null = null;
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let autoEndRide: (() => Promise<unknown>) | null = null;
let autoEndInFlight = false;


// Check if running as native app
const isNative = Capacitor.isNativePlatform();

// Shared state
type Listener = () => void;
const listeners = new Set<Listener>();

// Try to restore ride state from localStorage
function loadPersistedState(): ActiveRideState | null {
  try {
    const stored = localStorage.getItem(RIDE_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate it's still an active ride
      if (parsed && parsed.isActive && parsed.startedAt) {
        console.log('[Ride] Restored persisted ride state');
        return {
          ...parsed,
          isPaused: Boolean(parsed.isPaused),
        } as ActiveRideState;
      }
    }
  } catch (e) {
    console.warn('[Ride] Failed to restore persisted state:', e);
  }
  return null;
}

function persistState(state: ActiveRideState) {
  try {
    if (state.isActive) {
      localStorage.setItem(RIDE_STATE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(RIDE_STATE_KEY);
    }
  } catch (e) {
    console.warn('[Ride] Failed to persist state:', e);
  }
}

const restoredState = loadPersistedState();

let rideState: ActiveRideState = restoredState || {
  isActive: false,
  startedAt: null,
  isConvoyMode: false,
  isPaused: false,
  currentSpeed: 0,
  maxSpeed: 0,
  currentLean: 0,
  maxLeanLeft: 0,
  maxLeanRight: 0,
  maxGForce: 0,
  distance: 0,
  duration: 0,
  gpsPoints: [],
  leanSamples: [],
  gForceSamples: [],
  gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
  inactivityTimedOut: false,
};

let watchId: number | string | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;
let convoySyncTimeout: ReturnType<typeof setTimeout> | null = null;
let convoySyncDelay: number = CONVOY_SYNC_FAST_INTERVAL;
let belowIdleThresholdSince: number | null = null;
let worldSyncTimeout: ReturnType<typeof setTimeout> | null = null;
const WORLD_SYNC_INTERVAL = 30_000; // ms
let isAppBackgrounded = false;

// App-state changes (background/minimize/deep-link out) override the speed-based
// cadence with a conservative fallback ticker. The realtime channels themselves
// (voice, convoy mesh) are untouched here - only this polling cadence changes.
App.addListener('appStateChange', ({ isActive }) => {
  const backgrounded = !isActive;
  if (backgrounded === isAppBackgrounded) return;
  isAppBackgrounded = backgrounded;
  console.log(backgrounded
    ? '[Convoy] App backgrounded - downscaling sync to 45s fallback'
    : '[Convoy] App foregrounded - restoring active sync cadence');
  forceRescheduleConvoySync();
});
let lastPosition: { lat: number; lng: number; timestamp: number } | null = null;
let rideStartedAtMs: number | null = restoredState?.startedAt ? new Date(restoredState.startedAt).getTime() : null;
let smoothedSpeed = 0;
let currentConvoyId: string | null = null;
let isPaused = restoredState?.isPaused ?? false;
let totalPausedTime = 0;
let pausedAtMs: number | null = isPaused ? Date.now() : null;
let hasRestoredGps = false; // Track if we've already restored GPS for this session
let currentLeanAngle = 0; // Current lean angle for recording with GPS points
let lastLeanSampleTime = 0; // Track last lean sample time for 10Hz recording
const LEAN_SAMPLE_INTERVAL = 100; // 100ms = 10Hz
let lastGForceSampleTime = 0; // Track last G-force sample time for 10Hz recording
const GFORCE_SAMPLE_INTERVAL = 100; // 100ms = 10Hz

function getSnapshot(): ActiveRideState {
  return rideState;
}

function getServerSnapshot(): ActiveRideState {
  return rideState;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach(l => l());
}

function setRideState(updater: (prev: ActiveRideState) => ActiveRideState) {
  rideState = updater(rideState);
  persistState(rideState); // Persist on every state change
  emitChange();
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function estimateDistanceFromSpeedSamples(points: GpsPoint[]): number {
  if (points.length < 2) return 0;

  let estimatedMiles = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;

    if (elapsedSeconds <= 0 || elapsedSeconds > SPEED_DISTANCE_MAX_GAP_SEC) continue;

    const previousSpeed = Math.max(0, Math.min(previous.speed || 0, MAX_SPEED_SANITY));
    const currentSpeed = Math.max(0, Math.min(current.speed || 0, MAX_SPEED_SANITY));
    const averageSpeed = (previousSpeed + currentSpeed) / 2;
    estimatedMiles += averageSpeed * (elapsedSeconds / 3600);
  }

  return estimatedMiles;
}

// Unified position handler for both web and native
function handlePositionUpdate(latitude: number, longitude: number, deviceSpeed: number | null | undefined, accuracy: number | null | undefined, timestamp: number) {
  // Skip distance tracking when paused
  if (isPaused) {
    // Still update GPS status but don't accumulate distance
    setRideState(prev => ({
      ...prev,
      currentSpeed: 0,
      gpsStatus: { accuracy: accuracy ?? null, lastUpdate: timestamp, source: 'none' },
    }));
    return;
  }

  // Battery optimization: throttle updates when stationary
  const deviceSpeedMphQuick = deviceSpeed != null && deviceSpeed >= 0 ? deviceSpeed * 2.237 : null;
  const isStationary = deviceSpeedMphQuick !== null && deviceSpeedMphQuick < MIN_SPEED_THRESHOLD;
  
  // Track stationary time for Fallback badge
  const now = Date.now();
  if (isStationary) {
    if (lastStationaryCheck !== null) {
      const elapsed = (now - lastStationaryCheck) / 1000;
      if (elapsed > 0 && elapsed < 10) { // Sanity check - max 10 seconds between updates
        stationaryTimeSeconds += elapsed;
      }
    }
    lastStationaryCheck = now;
    
    stationaryCount++;
    // When stationary for a while, process fewer updates to save battery
    if (stationaryCount > STATIONARY_THRESHOLD && stationaryCount % (THROTTLE_SKIP_COUNT + 1) !== 0) {
      console.log('[GPS] Throttling stationary update, count:', stationaryCount);
      return;
    }
  } else {
    stationaryCount = 0; // Reset when moving
    lastStationaryCheck = null;
  }

  // Log GPS data for debugging (less verbose when stationary)
  if (!isStationary || stationaryCount <= STATIONARY_THRESHOLD) {
    console.log('[GPS] Position update:', { 
      lat: latitude.toFixed(6), 
      lng: longitude.toFixed(6), 
      accuracy: accuracy?.toFixed(0), 
      deviceSpeed: deviceSpeed?.toFixed(1),
      native: isNative
    });
  }

  // If accuracy is very poor, still track but with caution
  const accuracyOk = accuracy == null || accuracy <= MAX_ACCURACY_THRESHOLD;

  let calculatedSpeed = 0;
  let distanceIncrement = 0;

  // Calculate speed from GPS position change (more reliable than device speed)
  if (lastPosition) {
    const timeDeltaSeconds = (timestamp - lastPosition.timestamp) / 1000;

    // Ignore stale or implausible deltas
    if (timeDeltaSeconds >= 0.4 && timeDeltaSeconds < 120) {
      distanceIncrement = calculateDistance(
        lastPosition.lat,
        lastPosition.lng,
        latitude,
        longitude
      );

      const timeDeltaHours = timeDeltaSeconds / 3600;
      calculatedSpeed = timeDeltaHours > 0 ? distanceIncrement / timeDeltaHours : 0;

      // Sanity checks for GPS glitches - use constants
      if (calculatedSpeed > MAX_SPEED_SANITY || distanceIncrement > MAX_DISTANCE_JUMP) {
        console.log('[GPS] Rejected glitch:', { calculatedSpeed, distanceIncrement });
        calculatedSpeed = smoothedSpeed;
        distanceIncrement = 0;
      } else if (!accuracyOk) {
        // Poor accuracy - use reduced weight for distance
        console.log('[GPS] Poor accuracy, reducing distance weight');
        distanceIncrement *= 0.5;
      }
    }
  }

  // Device speed from GPS chip (m/s -> mph) - Doppler-based, very accurate for vehicles
  const deviceSpeedMph = deviceSpeed != null && deviceSpeed >= 0 ? deviceSpeed * 2.237 : null;

  // Prefer device speed - it's hardware-measured and more accurate than position deltas
  let currentSpeed: number;
  let speedSource: 'device' | 'calculated' | 'none' = 'none';
  
  if (deviceSpeedMph != null) {
    // Trust device speed even at low values (it can accurately report 0)
    currentSpeed = deviceSpeedMph;
    speedSource = 'device';
  } else if (calculatedSpeed > 0) {
    // Fall back to calculated speed only when device speed unavailable
    currentSpeed = calculatedSpeed;
    speedSource = 'calculated';
  } else {
    currentSpeed = 0;
  }

  // Adaptive smoothing: less smoothing when speed is changing rapidly (acceleration/braking)
  const speedDelta = Math.abs(currentSpeed - smoothedSpeed);
  const adaptiveFactor = speedDelta > SPEED_CHANGE_THRESHOLD 
    ? Math.min(0.9, SPEED_SMOOTHING_FACTOR + 0.15) // More responsive during rapid changes
    : SPEED_SMOOTHING_FACTOR;

  // Apply exponential smoothing
  smoothedSpeed = adaptiveFactor * currentSpeed + (1 - adaptiveFactor) * smoothedSpeed;

  // Apply minimum threshold to filter GPS drift when stationary
  const displaySpeed = smoothedSpeed < MIN_SPEED_THRESHOLD ? 0 : Math.round(smoothedSpeed);

  notifyConvoySyncOfSpeed(displaySpeed);

  if (displaySpeed > 0) lastMovementAtMs = Date.now();

  // Applies to solo rides too - an abandoned solo ride is exactly the case
  // that produced multi-day sessions sitting at 0 mph.
  checkInactivityGuard(latitude, longitude, displaySpeed, timestamp);


  const gpsPoint: GpsPoint = {
    lat: latitude,
    lng: longitude,
    speed: displaySpeed,
    timestamp,
    leanAngle: currentLeanAngle, // Include current lean angle
  };

  // Always update lastPosition so future deltas can recover quickly
  lastPosition = { lat: latitude, lng: longitude, timestamp };

  setRideState(prev => ({
    ...prev,
    currentSpeed: displaySpeed,
    maxSpeed: Math.max(prev.maxSpeed, displaySpeed),
    distance: prev.distance + distanceIncrement,
    gpsPoints: [...prev.gpsPoints, gpsPoint],
    gpsStatus: { accuracy: accuracy ?? null, lastUpdate: timestamp, source: speedSource },
  }));
}

// Web geolocation handler
function handleWebPosition(position: GeolocationPosition) {
  const { latitude, longitude, speed, accuracy } = position.coords;
  handlePositionUpdate(latitude, longitude, speed, accuracy, position.timestamp);
}

// Native Capacitor geolocation handler
function handleNativePosition(position: Position | null) {
  if (!position) return;
  const { latitude, longitude, speed, accuracy } = position.coords;
  handlePositionUpdate(latitude, longitude, speed, accuracy, position.timestamp);
}

function handlePositionError(error: GeolocationPositionError | unknown) {
  if (error && typeof error === 'object') {
    const maybeError = error as Partial<GeolocationPositionError>;
    console.warn('[GPS] Error:', maybeError.code || error, maybeError.message || '');
    return;
  }

  console.warn('[GPS] Error:', error);
}

// Helper: Start GPS watch
async function startGpsWatch() {
  console.log('[GPS] Starting watch, native:', isNative);
  
  if (isNative) {
    try {
      const permissions = await Geolocation.requestPermissions();
      console.log('[GPS] Permissions:', permissions);

      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      handleNativePosition(position);

      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true },
        handleNativePosition
      );
      console.log('[GPS] Native watch started, id:', watchId);
    } catch (error) {
      console.error('[GPS] Native error:', error);
      handlePositionError(error);
    }
  } else {
    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(handleWebPosition, handlePositionError, geoOptions);
    watchId = navigator.geolocation.watchPosition(handleWebPosition, handlePositionError, geoOptions);
    console.log('[GPS] Web watch started, id:', watchId);
  }
}

// Helper: Stop GPS watch
async function stopGpsWatch() {
  if (watchId !== null) {
    console.log('[GPS] Stopping watch, id:', watchId);
    if (isNative) {
      await Geolocation.clearWatch({ id: watchId as string });
    } else {
      navigator.geolocation.clearWatch(watchId as number);
    }
    watchId = null;
  }
}

// Sync stats to database for convoy members
async function syncConvoyStats() {
  if (!currentConvoyId || !rideState.isActive) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('convoy_members')
    .update({
      current_speed: Math.round(rideState.currentSpeed),
      top_speed: Math.round(rideState.maxSpeed),
      distance_driven: Number(rideState.distance.toFixed(2)),
      current_lat: lastPosition?.lat,
      current_lng: lastPosition?.lng,
      last_seen: new Date().toISOString(),
      stationary_time: Math.round(stationaryTimeSeconds),
    })
    .eq('convoy_id', currentConvoyId)
    .eq('user_id', user.id);

  if (error) {
    console.warn('[Convoy] Failed to sync stats:', error.message);
  } else {
    console.log('[Convoy] Synced stats:', { 
      speed: Math.round(rideState.currentSpeed), 
      topSpeed: Math.round(rideState.maxSpeed),
      distance: rideState.distance.toFixed(2),
      stationaryTime: Math.round(stationaryTimeSeconds)
    });
  }
}

// Picks the next sync delay. Backgrounded app overrides everything with the
// conservative fallback ticker; otherwise fast while moving, slow only after
// sitting below the idle threshold for the grace period.
function computeConvoySyncDelay(): number {
  if (isAppBackgrounded) {
    belowIdleThresholdSince = null;
    return CONVOY_SYNC_BACKGROUND_INTERVAL;
  }
  if (rideState.currentSpeed > CONVOY_IDLE_SPEED_MPH) {
    belowIdleThresholdSince = null;
    return CONVOY_SYNC_FAST_INTERVAL;
  }
  if (belowIdleThresholdSince === null) {
    belowIdleThresholdSince = Date.now();
  }
  const idleFor = Date.now() - belowIdleThresholdSince;
  return idleFor >= CONVOY_IDLE_GRACE_MS ? CONVOY_SYNC_SLOW_INTERVAL : CONVOY_SYNC_FAST_INTERVAL;
}

function scheduleConvoySync() {
  convoySyncDelay = computeConvoySyncDelay();
  convoySyncTimeout = setTimeout(() => {
    syncConvoyStats().catch(err => console.warn('[Convoy] Sync error:', err));
    scheduleConvoySync();
  }, convoySyncDelay);
}

// Cancels whatever wait is in flight and re-evaluates the cadence right away -
// used when an event (app foregrounded, speed crossing the idle threshold)
// shouldn't have to wait out the currently scheduled delay.
function forceRescheduleConvoySync() {
  if (!convoySyncTimeout) return;
  clearTimeout(convoySyncTimeout);
  scheduleConvoySync();
}

function startConvoySync() {
  if (convoySyncTimeout) clearTimeout(convoySyncTimeout);
  belowIdleThresholdSince = null;
  scheduleConvoySync();
}

function stopConvoySync() {
  if (convoySyncTimeout) {
    clearTimeout(convoySyncTimeout);
    convoySyncTimeout = null;
  }
  belowIdleThresholdSince = null;
}

// World location sync — writes to world_locations for any active rider (solo or
// convoy) who has opted into Blacktop World. Reads the flag directly from
// localStorage so it doesn't need to be threaded through the hook's props.
function isWorldSharingEnabled(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}');
    return s?.blacktopWorldEnabled === true;
  } catch { return false; }
}

async function syncWorldLocation() {
  if (!rideState.isActive || !lastPosition || !isWorldSharingEnabled()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('world_locations').upsert(
    { user_id: user.id, lat: lastPosition.lat, lng: lastPosition.lng, last_seen: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

async function clearWorldLocation() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('world_locations').delete().eq('user_id', user.id);
}

function startWorldSync() {
  if (worldSyncTimeout) clearTimeout(worldSyncTimeout);
  worldSyncTimeout = setTimeout(() => {
    syncWorldLocation().catch(() => {});
    startWorldSync();
  }, WORLD_SYNC_INTERVAL);
}

function stopWorldSync() {
  if (worldSyncTimeout) {
    clearTimeout(worldSyncTimeout);
    worldSyncTimeout = null;
  }
}

// Called on every speed update so crossing back above the idle threshold
// snaps the cadence back to fast immediately, instead of waiting out
// whatever slow-cadence wait is already in flight. A no-op while backgrounded -
// the background fallback ticker takes priority over speed.
function notifyConvoySyncOfSpeed(speedMph: number) {
  if (!convoySyncTimeout || !currentConvoyId || isAppBackgrounded) return;
  if (speedMph > CONVOY_IDLE_SPEED_MPH && belowIdleThresholdSince !== null) {
    belowIdleThresholdSince = null;
    if (convoySyncDelay !== CONVOY_SYNC_FAST_INTERVAL) {
      forceRescheduleConvoySync();
    }
  }
}

function resetInactivityTracking() {
  inactivityAnchor = null;
  inactivityLastCheck = null;
  inactivityStationarySeconds = 0;
  inactivityTriggered = false;
}

// Pauses GPS + convoy sync. `dueToInactivity` distinguishes the 15-minute
// auto-shutdown (which also halts the convoy stats polling loop and surfaces
// a toast) from a manual pause-button tap (which leaves convoy sync running
// at its normal idle cadence, as before).
function pauseRideTracking(dueToInactivity: boolean) {
  if (isPaused) return;
  isPaused = true;
  pausedAtMs = Date.now();
  stopGpsWatch();
  if (dueToInactivity) {
    stopConvoySync();
    stopWorldSync();
    clearWorldLocation().catch(() => {});
    console.log('[Ride] Inactivity guard - tracking paused after 15 stationary minutes');
    toast('Tracking paused due to inactivity.', {
      description: 'No movement detected for 15 minutes. Resume the ride to continue broadcasting your location.',
    });
  } else {
    console.log('[Ride] Paused - GPS stopped to save battery');
  }
  setRideState(prev => ({ ...prev, isPaused: true, currentSpeed: 0, inactivityTimedOut: dueToInactivity }));
}

// Checks continuous stationary time (speed 0 and GPS within a few meters of
// the last stationary fix) and triggers the soft-shutdown pause once it
// crosses the inactivity timeout. Only meaningful while in an active convoy.
function checkInactivityGuard(lat: number, lng: number, speedMph: number, timestamp: number) {
  if (speedMph > 0) {
    resetInactivityTracking();
    return;
  }

  if (!inactivityAnchor) {
    inactivityAnchor = { lat, lng };
    inactivityLastCheck = timestamp;
    inactivityStationarySeconds = 0;
    return;
  }

  const distanceMiles = calculateDistance(inactivityAnchor.lat, inactivityAnchor.lng, lat, lng);
  if (distanceMiles > INACTIVITY_RADIUS_MILES) {
    inactivityAnchor = { lat, lng };
    inactivityLastCheck = timestamp;
    inactivityStationarySeconds = 0;
    return;
  }

  if (inactivityLastCheck !== null) {
    const elapsed = (timestamp - inactivityLastCheck) / 1000;
    if (elapsed > 0 && elapsed < 60) { // sanity guard against stale/huge gaps
      inactivityStationarySeconds += elapsed;
    }
  }
  inactivityLastCheck = timestamp;

  if (!inactivityTriggered && inactivityStationarySeconds * 1000 >= INACTIVITY_TIMEOUT_MS) {
    inactivityTriggered = true;
    pauseRideTracking(true);
  }
}

export function useActiveRide(convoyId?: string | null) {
  const { addRide } = useRideHistory();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const addRideRef = useRef(addRide);
  addRideRef.current = addRide;

  // Resume GPS tracking if we have an active ride from restored state
  useEffect(() => {
    if (state.isActive && !state.isPaused && !hasRestoredGps && watchId === null) {
      console.log('[Ride] Resuming GPS tracking for restored ride');
      hasRestoredGps = true;
      
      // Restore rideStartedAtMs from startedAt if not set
      if (!rideStartedAtMs && state.startedAt) {
        rideStartedAtMs = new Date(state.startedAt).getTime();
      }
      
      // Start GPS tracking
      startGpsWatch();
      
      // Start duration counter
      if (!durationInterval) {
        durationInterval = setInterval(() => {
          if (!rideStartedAtMs || isPaused) return;
          const totalElapsed = Date.now() - rideStartedAtMs;
          const activeTime = totalElapsed - totalPausedTime;
          const seconds = Math.max(0, Math.floor(activeTime / 1000));
          setRideState(prev => ({
            ...prev,
            duration: seconds,
          }));
        }, 500);
      }
      
      // Start convoy sync if in convoy mode
      if (state.isConvoyMode && convoyId && !convoySyncTimeout) {
        currentConvoyId = convoyId;
        console.log('[Convoy] Resuming stats sync for convoy:', convoyId);
        startConvoySync();
      }

      // Resume world sync
      if (!worldSyncTimeout) startWorldSync();
    }
  }, [state.isActive, state.isPaused, state.isConvoyMode, state.startedAt, convoyId]);

  const startRide = useCallback((isConvoyMode: boolean = false, activeConvoyId?: string | null) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return false;
    }

    const startedAt = new Date().toISOString();
    rideStartedAtMs = Date.now();
    smoothedSpeed = 0;
    lastPosition = null;
    currentConvoyId = activeConvoyId || convoyId || null;
    isPaused = false;
    totalPausedTime = 0;
    stationaryTimeSeconds = 0; // Reset stationary tracking
    lastStationaryCheck = null;
    pausedAtMs = null;
    stationaryCount = 0; // Reset battery optimization counter
    hasRestoredGps = true; // Mark as handled so restoration effect doesn't double-start
    resetInactivityTracking();

    setRideState(() => ({
      isActive: true,
      startedAt,
      isConvoyMode,
      isPaused: false,
      currentSpeed: 0,
      maxSpeed: 0,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
      maxGForce: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
      leanSamples: [],
      gForceSamples: [],
      gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
      inactivityTimedOut: false,
    }));

    // Start convoy sync if in convoy mode
    if (isConvoyMode && currentConvoyId) {
      console.log('[Convoy] Starting stats sync for convoy:', currentConvoyId);
      startConvoySync();
    }

    // World location sync (convoy + solo, gated by blacktopWorldEnabled setting)
    startWorldSync();
    syncWorldLocation().catch(() => {});

    // Start GPS tracking using helper
    startGpsWatch();

    // Duration counter based on wall-clock time (so short rides still count)
    // Subtracts paused time from the total
    durationInterval = setInterval(() => {
      if (!rideStartedAtMs || isPaused) return;
      const totalElapsed = Date.now() - rideStartedAtMs;
      const activeTime = totalElapsed - totalPausedTime;
      const seconds = Math.max(0, Math.floor(activeTime / 1000));
      setRideState(prev => ({
        ...prev,
        duration: seconds,
      }));
    }, 500);

    return true;
  }, [convoyId]);

  const endRide = useCallback(async (): Promise<string | null> => {
    // Stop GPS tracking using helper
    stopGpsWatch(); // Don't await - non-blocking

    // Stop duration counter
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    // Stop convoy sync schedule
    stopConvoySync();

    // Final sync in background (non-blocking)
    if (currentConvoyId) {
      syncConvoyStats().catch(err => console.warn('[Convoy] Final sync error:', err));
    }
    currentConvoyId = null;

    // Stop world sync and remove this rider from the live count
    stopWorldSync();
    clearWorldLocation().catch(() => {});

    // Save the ride
    const currentState = rideState;
    const nowIso = new Date().toISOString();
    // Use the already-calculated duration from state (which correctly excludes paused time)
    // Fallback to wall-clock calculation minus paused time if state duration is 0
    const finalDuration = currentState.duration > 0 
      ? currentState.duration 
      : rideStartedAtMs
        ? Math.max(0, Math.floor((Date.now() - rideStartedAtMs - totalPausedTime) / 1000))
        : 0;

    let savedRideId: string | null = null;

    // Free the persisted active-ride snapshot before writing history. Long
    // rides can be bulky; keeping both copies during save can exceed mobile
    // storage limits even when the final history receipt would fit.
    try {
      localStorage.removeItem(RIDE_STATE_KEY);
    } catch {
      console.warn('[Ride] Failed to clear active ride snapshot before save');
    }

    // Guard against accidental/rapid-fire start-stop sessions corrupting
    // garage stats, odometer rollups, and trading-card XP. Anything shorter
    // than MIN_RIDE_DURATION_SEC or MIN_RIDE_DISTANCE_MI is dropped before it
    // ever touches local storage so no receipt, no stats write, no card
    // recalculation happens.
    const MIN_RIDE_DURATION_SEC = 60;
    const MIN_RIDE_DISTANCE_MI = 0.09;
    const speedEstimatedDistance = estimateDistanceFromSpeedSamples(currentState.gpsPoints);
    const finalDistance = Math.max(currentState.distance, speedEstimatedDistance);
    const hasMovementEvidence = currentState.maxSpeed >= MIN_MOVING_SPEED_FOR_SAVE_MPH && currentState.gpsPoints.length >= 2;
    const isValidRide =
      !!currentState.startedAt &&
      finalDuration >= MIN_RIDE_DURATION_SEC &&
      (finalDistance >= MIN_RIDE_DISTANCE_MI || hasMovementEvidence);

    if (isValidRide) {
      const rideId = crypto.randomUUID();
      const bikeId = getActiveBikeIdSnapshot() ?? undefined;
      const ride: RideSession = {
        id: rideId,
        startedAt: currentState.startedAt!,
        endedAt: nowIso,
        isConvoyRide: currentState.isConvoyMode,
        distance: finalDistance,
        duration: finalDuration,
        averageSpeed: finalDuration > 0 ? (finalDistance / (finalDuration / 3600)) : 0,
        maxSpeed: currentState.maxSpeed,
        maxLeanLeft: currentState.maxLeanLeft,
        maxLeanRight: currentState.maxLeanRight,
        maxGForce: currentState.maxGForce > 0 ? currentState.maxGForce : undefined,
        gpsPoints: currentState.gpsPoints,
        leanSamples: currentState.leanSamples,
        gForceSamples: currentState.gForceSamples,
        bikeId,
      };
      const didSaveRide = addRideRef.current(ride);
      if (didSaveRide) {
        savedRideId = rideId;
      } else {
        toast.error('Ride could not be saved', {
          description: 'Device storage is full. Burn old data or remove large ride photos, then try again.',
        });
      }
    } else if (currentState.startedAt) {
      console.log('[Ride] Discarded invalid session', {
        duration: finalDuration,
        distance: currentState.distance,
        speedEstimatedDistance,
      });
      const tooShort = finalDuration < MIN_RIDE_DURATION_SEC;
      const tooFar = finalDistance < MIN_RIDE_DISTANCE_MI && !hasMovementEvidence;
      toast.info('Ride not saved', {
        description: tooShort && tooFar
          ? 'Rides under 1 min and 0.1 mi are discarded.'
          : tooShort
            ? `Ride was under 1 minute (${finalDuration}s) — not saved.`
            : `Ride was under 0.1 mi (${finalDistance.toFixed(2)} mi) — not saved.`,
      });
    }

    rideStartedAtMs = null;
    resetInactivityTracking();

    setRideState(() => ({
      isActive: false,
      startedAt: null,
      isConvoyMode: false,
      isPaused: false,
      currentSpeed: 0,
      maxSpeed: 0,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
      maxGForce: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
      leanSamples: [],
      gForceSamples: [],
      gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
      inactivityTimedOut: false,
    }));

    return savedRideId;
  }, []);

  const setRidePaused = useCallback((paused: boolean) => {
    if (paused && !isPaused) {
      pauseRideTracking(false);
    } else if (!paused && isPaused) {
      // Resuming from pause - restart GPS (and convoy sync, if the
      // inactivity guard had stopped it)
      if (pausedAtMs) {
        totalPausedTime += Date.now() - pausedAtMs;
      }
      isPaused = false;
      pausedAtMs = null;
      stationaryCount = 0; // Reset throttle counter
      resetInactivityTracking();
      startGpsWatch();
      if (!convoySyncTimeout && currentConvoyId && rideState.isConvoyMode) {
        startConvoySync();
      }
      if (!worldSyncTimeout) startWorldSync();
      setRideState(prev => ({ ...prev, isPaused: false, inactivityTimedOut: false }));
      console.log('[Ride] Resumed - GPS restarted, total paused time:', totalPausedTime);
    }
  }, []);

  // Update lean angle during ride (called from components using useLeanAngle)
  const updateLeanAngle = useCallback((currentLean: number, maxLeanLeft: number, maxLeanRight: number) => {
    if (!rideState.isActive || isPaused) return;
    
    // Store current lean for GPS point recording
    currentLeanAngle = currentLean;
    
    // Record lean sample at 10Hz
    const now = Date.now();
    const shouldSample = now - lastLeanSampleTime >= LEAN_SAMPLE_INTERVAL;
    
    setRideState(prev => {
      const newState = {
        ...prev,
        currentLean,
        maxLeanLeft: Math.max(prev.maxLeanLeft, maxLeanLeft),
        maxLeanRight: Math.max(prev.maxLeanRight, maxLeanRight),
      };
      
      // Add lean sample at 10Hz rate
      if (shouldSample) {
        lastLeanSampleTime = now;
        newState.leanSamples = [...prev.leanSamples, { angle: currentLean, timestamp: now }];
      }
      
      return newState;
    });
  }, []);

  // Update G-force during ride (called from components using useGForce)
  const updateGForce = useCallback((currentG: number, maxG: number) => {
    if (!rideState.isActive || isPaused) return;

    // Record G-force sample at 10Hz
    const now = Date.now();
    const shouldSample = now - lastGForceSampleTime >= GFORCE_SAMPLE_INTERVAL;

    setRideState(prev => {
      const newState = {
        ...prev,
        maxGForce: Math.max(prev.maxGForce, maxG),
      };

      // Add G-force sample at 10Hz rate
      if (shouldSample) {
        lastGForceSampleTime = now;
        newState.gForceSamples = [...prev.gForceSamples, { g: currentG, timestamp: now }];
      }

      return newState;
    });
  }, []);

  return {
    rideState: state,
    startRide,
    endRide,
    setRidePaused,
    updateLeanAngle,
    updateGForce,
  };
}
