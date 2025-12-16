import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { RideSession, RideStats } from '@/types/blacktop';

const RIDES_KEY = 'blacktop_rides';

function generateDemoRides(): RideSession[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  return [
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 2 * hour).toISOString(),
      endedAt: new Date(now - 1 * hour).toISOString(),
      isConvoyRide: true,
      distance: 45.2,
      duration: 3420, // 57 mins
      averageSpeed: 47,
      maxSpeed: 78,
      gpsPoints: [],
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 1 * day - 3 * hour).toISOString(),
      endedAt: new Date(now - 1 * day - 1 * hour).toISOString(),
      isConvoyRide: false,
      distance: 82.7,
      duration: 5400, // 1.5 hours
      averageSpeed: 55,
      maxSpeed: 92,
      gpsPoints: [],
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 3 * day - 4 * hour).toISOString(),
      endedAt: new Date(now - 3 * day - 2 * hour).toISOString(),
      isConvoyRide: true,
      distance: 67.3,
      duration: 4800, // 80 mins
      averageSpeed: 50,
      maxSpeed: 85,
      gpsPoints: [],
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 5 * day - 2 * hour).toISOString(),
      endedAt: new Date(now - 5 * day - 1 * hour).toISOString(),
      isConvoyRide: false,
      distance: 28.4,
      duration: 2100, // 35 mins
      averageSpeed: 48,
      maxSpeed: 71,
      gpsPoints: [],
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 7 * day - 5 * hour).toISOString(),
      endedAt: new Date(now - 7 * day - 2 * hour).toISOString(),
      isConvoyRide: true,
      distance: 124.8,
      duration: 9000, // 2.5 hours
      averageSpeed: 50,
      maxSpeed: 88,
      gpsPoints: [],
    },
  ];
}

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

  const seedDemoData = useCallback(() => {
    if (rides.length === 0) {
      setRides(generateDemoRides());
    }
  }, [rides.length, setRides]);

  return {
    rides,
    stats,
    addRide,
    deleteRide,
    burnAllData,
    seedDemoData,
  };
}
