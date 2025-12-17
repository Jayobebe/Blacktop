import { useCallback, useRef, useSyncExternalStore } from 'react';
import { ActiveRideState, RideSession, GpsPoint } from '@/types/blacktop';
import { useRideHistory } from './useRideHistory';

const SPEED_SMOOTHING_FACTOR = 0.3;
const MIN_SPEED_THRESHOLD = 1; // mph - ignore speeds below this (GPS noise when stationary)

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
let lastPosition: { lat: number; lng: number; timestamp: number } | null = null;
let rideStartedAtMs: number | null = null;
let smoothedSpeed = 0;

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

  // If accuracy is very poor, don't trust this point for distance/speed.
  const accuracyOk = accuracy == null || accuracy <= 80;

  let calculatedSpeed = 0;
  let distanceIncrement = 0;

  // Calculate speed from GPS position change (more reliable than device speed)
  if (lastPosition && accuracyOk) {
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

      // Sanity checks for GPS glitches
      if (calculatedSpeed > 200 || distanceIncrement > 0.5) {
        calculatedSpeed = smoothedSpeed;
        distanceIncrement = 0;
      }
    }
  }

  // Device speed fallback (m/s -> mph)
  const deviceSpeedMph = deviceSpeed != null ? deviceSpeed * 2.237 : 0;

  // Prefer calculated speed; fall back to device speed when we don't have enough movement data yet.
  let currentSpeed = calculatedSpeed;
  if (currentSpeed === 0 && deviceSpeedMph > MIN_SPEED_THRESHOLD) {
    currentSpeed = deviceSpeedMph;
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
  console.warn('GPS Error:', error.message);
}

export function useActiveRide() {
  const { addRide } = useRideHistory();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const addRideRef = useRef(addRide);
  addRideRef.current = addRide;

  const startRide = useCallback((isConvoyMode: boolean = false) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return false;
    }

    const startedAt = new Date().toISOString();
    rideStartedAtMs = Date.now();
    smoothedSpeed = 0;
    lastPosition = null;

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

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 1000, // Allow slightly stale positions to reduce battery usage
    };

    // Prime GPS with a one-time read (often prevents early TIMEOUTs)
    navigator.geolocation.getCurrentPosition(handlePositionUpdate, handlePositionError, geoOptions);

    // Start GPS tracking
    watchId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geoOptions);

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
  }, []);

  const endRide = useCallback(() => {
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
