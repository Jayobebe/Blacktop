import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { RideSession, RideStats } from '@/types/blacktop';

const RIDES_KEY = 'blacktop_rides';

export function useRideHistory() {
  const [rides, setRides, clearRides] = useLocalStorage<RideSession[]>(RIDES_KEY, []);

  const addRide = useCallback((ride: RideSession) => {
    setRides(prev => [ride, ...prev]);
  }, [setRides]);

  const deleteRide = useCallback((rideId: string) => {
    setRides(prev => prev.filter(r => r.id !== rideId));
  }, [setRides]);

  const stats: RideStats = useMemo(() => {
    const completedRides = rides.filter(r => r.endedAt !== null);
    const totalDistance = completedRides.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = completedRides.reduce((sum, r) => sum + r.duration, 0);
    const personalTopSpeed = Math.max(0, ...completedRides.map(r => r.maxSpeed));
    const convoyRides = completedRides.filter(r => r.isConvoyRide).length;

    return {
      totalRides: completedRides.length,
      totalDistance,
      totalDuration,
      personalTopSpeed,
      averageRideLength: completedRides.length > 0 ? totalDistance / completedRides.length : 0,
      convoyRides,
    };
  }, [rides]);

  const burnAllData = useCallback(() => {
    clearRides();
  }, [clearRides]);

  return {
    rides,
    stats,
    addRide,
    deleteRide,
    burnAllData,
  };
}
