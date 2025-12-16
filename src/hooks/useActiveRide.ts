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
  
  let calculatedSpeed = 0;
  let distanceIncrement = 0;

  // Calculate speed from GPS position change (more reliable than device speed)
  if (lastPosition) {
    const timeDeltaSeconds = (timestamp - lastPosition.timestamp) / 1000;
    
    if (timeDeltaSeconds > 0 && timeDeltaSeconds < 30) { // Ignore stale readings
      distanceIncrement = calculateDistance(
        lastPosition.lat,
        lastPosition.lng,
        latitude,
        longitude
      );
      
      // Calculate speed: distance (miles) / time (hours)
      const timeDeltaHours = timeDeltaSeconds / 3600;
      calculatedSpeed = distanceIncrement / timeDeltaHours;
      
      // Sanity checks
      // Ignore unrealistic speeds (> 200 mph likely GPS glitch)
      if (calculatedSpeed > 200) {
        calculatedSpeed = smoothedSpeed; // Keep previous speed
        distanceIncrement = 0; // Don't count this distance
      }
      
      // Ignore unrealistic distance jumps (GPS glitches)
      if (distanceIncrement > 0.5) {
        distanceIncrement = 0;
        calculatedSpeed = smoothedSpeed;
      }
    }
  }

  // Use device speed as fallback if calculated speed seems wrong and device speed is available
  const deviceSpeedMph = deviceSpeed !== null ? deviceSpeed * 2.237 : 0;
  
  // Prefer calculated speed, but use device speed if we have no movement data yet
  let currentSpeed = calculatedSpeed;
  if (calculatedSpeed === 0 && deviceSpeedMph > MIN_SPEED_THRESHOLD) {
    currentSpeed = deviceSpeedMph;
  }
  
  // Apply exponential smoothing to reduce GPS jitter
  smoothedSpeed = SPEED_SMOOTHING_FACTOR * currentSpeed + (1 - SPEED_SMOOTHING_FACTOR) * smoothedSpeed;
  
  // Round and apply minimum threshold
  const displaySpeed = smoothedSpeed < MIN_SPEED_THRESHOLD ? 0 : Math.round(smoothedSpeed);

  const gpsPoint: GpsPoint = {
    lat: latitude,
    lng: longitude,
    speed: displaySpeed,
    timestamp,
  };

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

    // Start GPS tracking
    watchId = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );

    // Start duration counter
    durationInterval = setInterval(() => {
      setRideState(prev => ({
        ...prev,
        duration: prev.duration + 1,
      }));
    }, 1000);

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
    if (currentState.startedAt && currentState.duration > 0) {
      const ride: RideSession = {
        id: crypto.randomUUID(),
        startedAt: currentState.startedAt,
        endedAt: new Date().toISOString(),
        isConvoyRide: currentState.isConvoyMode,
        distance: currentState.distance,
        duration: currentState.duration,
        averageSpeed: currentState.duration > 0 
          ? (currentState.distance / (currentState.duration / 3600)) 
          : 0,
        maxSpeed: currentState.maxSpeed,
        gpsPoints: currentState.gpsPoints,
      };
      addRideRef.current(ride);
    }

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
