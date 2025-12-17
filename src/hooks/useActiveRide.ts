import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Geolocation, Position, CallbackID } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { ActiveRideState, RideSession, GpsPoint } from '@/types/blacktop';
import { useRideHistory } from './useRideHistory';
import { supabase } from '@/integrations/supabase/client';

const SPEED_SMOOTHING_FACTOR = 0.75; // Higher = more responsive to current reading
const MIN_SPEED_THRESHOLD = 0.3; // mph - very low threshold to catch movement early
const MAX_ACCURACY_THRESHOLD = 200; // meters - accept moderately poor GPS
const MAX_SPEED_SANITY = 200; // mph - reject speeds above this
const MAX_DISTANCE_JUMP = 0.5; // miles - tighter check for GPS jumps
const CONVOY_SYNC_INTERVAL = 2000; // ms - sync to database every 2 seconds
const SPEED_CHANGE_THRESHOLD = 5; // mph - if speed changes more than this, reduce smoothing

// Battery optimization: track consecutive stationary readings
let stationaryCount = 0;
const STATIONARY_THRESHOLD = 3; // Number of zero-speed readings before throttling
const THROTTLE_SKIP_COUNT = 2; // Skip this many updates when stationary (process every 3rd)

// Check if running as native app
const isNative = Capacitor.isNativePlatform();

// Shared state
type Listener = () => void;
const listeners = new Set<Listener>();

let rideState: ActiveRideState = {
  isActive: false,
  startedAt: null,
  isConvoyMode: false,
  currentSpeed: 0,
  maxSpeed: 0,
  distance: 0,
  duration: 0,
  gpsPoints: [],
  gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
};

let watchId: number | string | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;
let convoySyncInterval: ReturnType<typeof setInterval> | null = null;
let lastPosition: { lat: number; lng: number; timestamp: number } | null = null;
let rideStartedAtMs: number | null = null;
let smoothedSpeed = 0;
let currentConvoyId: string | null = null;
let isPaused = false;
let totalPausedTime = 0;
let pausedAtMs: number | null = null;

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
  
  if (isStationary) {
    stationaryCount++;
    // When stationary for a while, process fewer updates to save battery
    if (stationaryCount > STATIONARY_THRESHOLD && stationaryCount % (THROTTLE_SKIP_COUNT + 1) !== 0) {
      console.log('[GPS] Throttling stationary update, count:', stationaryCount);
      return;
    }
  } else {
    stationaryCount = 0; // Reset when moving
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

  const gpsPoint: GpsPoint = {
    lat: latitude,
    lng: longitude,
    speed: displaySpeed,
    timestamp,
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

function handlePositionError(error: GeolocationPositionError | any) {
  console.warn('[GPS] Error:', error.code || error, error.message || '');
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
    })
    .eq('convoy_id', currentConvoyId)
    .eq('user_id', user.id);

  if (error) {
    console.warn('[Convoy] Failed to sync stats:', error.message);
  } else {
    console.log('[Convoy] Synced stats:', { 
      speed: Math.round(rideState.currentSpeed), 
      topSpeed: Math.round(rideState.maxSpeed),
      distance: rideState.distance.toFixed(2) 
    });
  }
}

export function useActiveRide(convoyId?: string | null) {
  const { addRide } = useRideHistory();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const addRideRef = useRef(addRide);
  addRideRef.current = addRide;

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
    pausedAtMs = null;
    stationaryCount = 0; // Reset battery optimization counter

    setRideState(() => ({
      isActive: true,
      startedAt,
      isConvoyMode,
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
      gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
    }));

    // Start convoy sync if in convoy mode
    if (isConvoyMode && currentConvoyId) {
      console.log('[Convoy] Starting stats sync for convoy:', currentConvoyId);
      convoySyncInterval = setInterval(syncConvoyStats, CONVOY_SYNC_INTERVAL);
    }

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
    await stopGpsWatch();

    // Stop duration counter
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    // Stop convoy sync and do final sync
    if (convoySyncInterval) {
      clearInterval(convoySyncInterval);
      convoySyncInterval = null;
      await syncConvoyStats(); // Final sync before ending
    }
    currentConvoyId = null;

    // Save the ride
    const currentState = rideState;
    const nowIso = new Date().toISOString();
    const finalDuration = rideStartedAtMs
      ? Math.max(0, Math.floor((Date.now() - rideStartedAtMs) / 1000))
      : currentState.duration;

    let savedRideId: string | null = null;

    if (currentState.startedAt && finalDuration > 0) {
      const rideId = crypto.randomUUID();
      const ride: RideSession = {
        id: rideId,
        startedAt: currentState.startedAt,
        endedAt: nowIso,
        isConvoyRide: currentState.isConvoyMode,
        distance: currentState.distance,
        duration: finalDuration,
        averageSpeed: finalDuration > 0 ? (currentState.distance / (finalDuration / 3600)) : 0,
        maxSpeed: currentState.maxSpeed,
        gpsPoints: currentState.gpsPoints,
      };
      addRideRef.current(ride);
      savedRideId = rideId;
    }

    rideStartedAtMs = null;

    setRideState(() => ({
      isActive: false,
      startedAt: null,
      isConvoyMode: false,
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
      gpsStatus: { accuracy: null, lastUpdate: null, source: 'none' },
    }));

    return savedRideId;
  }, []);

  const setRidePaused = useCallback((paused: boolean) => {
    if (paused && !isPaused) {
      // Starting pause - stop GPS to save battery
      isPaused = true;
      pausedAtMs = Date.now();
      stopGpsWatch();
      console.log('[Ride] Paused - GPS stopped to save battery');
    } else if (!paused && isPaused) {
      // Resuming from pause - restart GPS
      if (pausedAtMs) {
        totalPausedTime += Date.now() - pausedAtMs;
      }
      isPaused = false;
      pausedAtMs = null;
      stationaryCount = 0; // Reset throttle counter
      startGpsWatch();
      console.log('[Ride] Resumed - GPS restarted, total paused time:', totalPausedTime);
    }
  }, []);

  return {
    rideState: state,
    startRide,
    endRide,
    setRidePaused,
  };
}
