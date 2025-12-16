import { useState, useCallback, useRef, useEffect } from 'react';
import { ActiveRideState, RideSession, GpsPoint } from '@/types/blacktop';
import { useRideHistory } from './useRideHistory';

const SPEED_SMOOTHING_FACTOR = 0.3;

export function useActiveRide() {
  const { addRide } = useRideHistory();
  const [rideState, setRideState] = useState<ActiveRideState>({
    isActive: false,
    startedAt: null,
    isConvoyMode: false,
    currentSpeed: 0,
    maxSpeed: 0,
    distance: 0,
    duration: 0,
    gpsPoints: [],
  });

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const smoothedSpeedRef = useRef(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handlePositionUpdate = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, speed } = position.coords;
    const timestamp = position.timestamp;
    
    // Convert m/s to mph, default to 0 if null
    let currentSpeed = speed !== null ? speed * 2.237 : 0;
    
    // Apply exponential smoothing to reduce GPS jitter
    smoothedSpeedRef.current = 
      SPEED_SMOOTHING_FACTOR * currentSpeed + 
      (1 - SPEED_SMOOTHING_FACTOR) * smoothedSpeedRef.current;
    
    currentSpeed = Math.max(0, Math.round(smoothedSpeedRef.current));

    let distanceIncrement = 0;
    if (lastPositionRef.current) {
      distanceIncrement = calculateDistance(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        latitude,
        longitude
      );
      // Ignore unrealistic distance jumps (GPS glitches)
      if (distanceIncrement > 0.5) {
        distanceIncrement = 0;
      }
    }

    const gpsPoint: GpsPoint = {
      lat: latitude,
      lng: longitude,
      speed: currentSpeed,
      timestamp,
    };

    lastPositionRef.current = { lat: latitude, lng: longitude, timestamp };

    setRideState(prev => ({
      ...prev,
      currentSpeed,
      maxSpeed: Math.max(prev.maxSpeed, currentSpeed),
      distance: prev.distance + distanceIncrement,
      gpsPoints: [...prev.gpsPoints, gpsPoint],
    }));
  }, []);

  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    console.warn('GPS Error:', error.message);
    // Don't stop the ride on GPS error, just log it
  }, []);

  const startRide = useCallback((isConvoyMode: boolean = false) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return false;
    }

    const startedAt = new Date().toISOString();
    smoothedSpeedRef.current = 0;
    lastPositionRef.current = null;

    setRideState({
      isActive: true,
      startedAt,
      isConvoyMode,
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
    });

    // Start GPS tracking
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );

    // Start duration counter
    durationIntervalRef.current = setInterval(() => {
      setRideState(prev => ({
        ...prev,
        duration: prev.duration + 1,
      }));
    }, 1000);

    return true;
  }, [handlePositionUpdate, handlePositionError]);

  const endRide = useCallback(() => {
    // Stop GPS tracking
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Stop duration counter
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Save the ride
    if (rideState.startedAt && rideState.duration > 0) {
      const ride: RideSession = {
        id: crypto.randomUUID(),
        startedAt: rideState.startedAt,
        endedAt: new Date().toISOString(),
        isConvoyRide: rideState.isConvoyMode,
        distance: rideState.distance,
        duration: rideState.duration,
        averageSpeed: rideState.duration > 0 
          ? (rideState.distance / (rideState.duration / 3600)) 
          : 0,
        maxSpeed: rideState.maxSpeed,
        gpsPoints: rideState.gpsPoints,
      };
      addRide(ride);
    }

    setRideState({
      isActive: false,
      startedAt: null,
      isConvoyMode: false,
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
      gpsPoints: [],
    });
  }, [rideState, addRide]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  return {
    rideState,
    startRide,
    endRide,
  };
}
