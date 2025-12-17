import { useCallback, useRef, useSyncExternalStore } from 'react';
import { ActiveRideState, RideSession, GpsPoint } from '@/types/blacktop';
import { useRideHistory } from './useRideHistory';
import { supabase } from '@/integrations/supabase/client';

const SPEED_SMOOTHING_FACTOR = 0.3;
const MIN_SPEED_THRESHOLD = 1; // mph - ignore speeds below this (GPS noise when stationary)
const MAX_ACCURACY_THRESHOLD = 150; // meters - allow less accurate positions
const MAX_SPEED_SANITY = 200; // mph - reject speeds above this
const MAX_DISTANCE_JUMP = 1; // miles - reject distance jumps larger than this
const CONVOY_SYNC_INTERVAL = 2000; // ms - sync to database every 2 seconds

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
};

let watchId: number | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;
let convoySyncInterval: ReturnType<typeof setInterval> | null = null;
let lastPosition: { lat: number; lng: number; timestamp: number } | null = null;
let rideStartedAtMs: number | null = null;
let smoothedSpeed = 0;
let currentConvoyId: string | null = null;

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

function handlePositionUpdate(position: GeolocationPosition) {
  const { latitude, longitude, speed: deviceSpeed, accuracy } = position.coords;
  const timestamp = position.timestamp;

  // Log GPS data for debugging
  console.log('[GPS] Position update:', { 
    lat: latitude.toFixed(6), 
    lng: longitude.toFixed(6), 
    accuracy: accuracy?.toFixed(0), 
    deviceSpeed: deviceSpeed?.toFixed(1) 
  });

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

  // Device speed from GPS chip (m/s -> mph) - often more accurate via Doppler
  const deviceSpeedMph = deviceSpeed != null && deviceSpeed >= 0 ? deviceSpeed * 2.237 : null;

  // Prefer device speed when available (GPS chip's Doppler is more accurate for vehicles)
  // Fall back to calculated speed only when device speed is unavailable
  let currentSpeed: number;
  if (deviceSpeedMph != null && deviceSpeedMph > MIN_SPEED_THRESHOLD) {
    currentSpeed = deviceSpeedMph;
    console.log('[GPS] Using device speed:', deviceSpeedMph.toFixed(1), 'mph');
  } else if (calculatedSpeed > MIN_SPEED_THRESHOLD) {
    currentSpeed = calculatedSpeed;
    console.log('[GPS] Using calculated speed:', calculatedSpeed.toFixed(1), 'mph');
  } else {
    currentSpeed = 0;
  }

  // Apply exponential smoothing to reduce jitter
  smoothedSpeed = SPEED_SMOOTHING_FACTOR * currentSpeed + (1 - SPEED_SMOOTHING_FACTOR) * smoothedSpeed;

  // Round and apply minimum threshold (ignore drift)
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
  }));
}

function handlePositionError(error: GeolocationPositionError) {
  console.warn('[GPS] Error:', error.code, error.message);
  // Error codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
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

    setRideState(() => ({
      isActive: true,
      startedAt,
      isConvoyMode,
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
    }));

    // Start convoy sync if in convoy mode
    if (isConvoyMode && currentConvoyId) {
      console.log('[Convoy] Starting stats sync for convoy:', currentConvoyId);
      convoySyncInterval = setInterval(syncConvoyStats, CONVOY_SYNC_INTERVAL);
    }

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 1000, // Allow slightly stale positions to reduce battery usage
    };

    console.log('[GPS] Starting ride tracking with options:', geoOptions);

    // Prime GPS with a one-time read (often prevents early TIMEOUTs)
    navigator.geolocation.getCurrentPosition(handlePositionUpdate, handlePositionError, geoOptions);

    // Start GPS tracking
    watchId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geoOptions);
    console.log('[GPS] Watch started, id:', watchId);

    // Duration counter based on wall-clock time (so short rides still count)
    durationInterval = setInterval(() => {
      if (!rideStartedAtMs) return;
      const seconds = Math.max(0, Math.floor((Date.now() - rideStartedAtMs) / 1000));
      setRideState(prev => ({
        ...prev,
        duration: seconds,
      }));
    }, 500);

    return true;
  }, [convoyId]);

  const endRide = useCallback(async () => {
    // Stop GPS tracking
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

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

    if (currentState.startedAt && finalDuration > 0) {
      const ride: RideSession = {
        id: crypto.randomUUID(),
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
    }));
  }, []);

  return {
    rideState: state,
    startRide,
    endRide,
  };
}
