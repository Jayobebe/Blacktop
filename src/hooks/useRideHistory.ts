import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { RideSession, RideStats } from '@/types/blacktop';

const RIDES_KEY = 'blacktop_rides';
const SEEDED_KEY = 'blacktop_demo_seeded';

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
      duration: 3420,
      averageSpeed: 47,
      maxSpeed: 78,
      gpsPoints: [],
      earnedBadge: 'speed-demon',
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 1 * day - 3 * hour).toISOString(),
      endedAt: new Date(now - 1 * day - 1 * hour).toISOString(),
      isConvoyRide: false,
      distance: 82.7,
      duration: 5400,
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
      duration: 4800,
      averageSpeed: 50,
      maxSpeed: 85,
      gpsPoints: [],
      earnedBadge: 'journeyman',
    },
    {
      id: crypto.randomUUID(),
      startedAt: new Date(now - 5 * day - 2 * hour).toISOString(),
      endedAt: new Date(now - 5 * day - 1 * hour).toISOString(),
      isConvoyRide: false,
      distance: 28.4,
      duration: 2100,
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
      duration: 9000,
      averageSpeed: 50,
      maxSpeed: 88,
      gpsPoints: [],
      earnedBadge: 'rocksteady',
    },
  ];
}

export function useRideHistory() {
  const [rides, setRides, clearRides] = useLocalStorage<RideSession[]>(RIDES_KEY, []);
  const [hasSeeded, setHasSeeded] = useLocalStorage<boolean>(SEEDED_KEY, false);

  const addRide = useCallback((ride: RideSession) => {
    setRides(prev => [ride, ...prev]);
  }, [setRides]);

  const updateRideBadge = useCallback((rideId: string, badge: 'speed-demon' | 'journeyman' | 'rocksteady') => {
    setRides(prev => prev.map(r => 
      r.id === rideId ? { ...r, earnedBadge: badge } : r
    ));
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
    
    // Count badges
    const badges = completedRides.reduce(
      (acc, r) => {
        if (r.earnedBadge === 'speed-demon') acc.speedDemon++;
        else if (r.earnedBadge === 'journeyman') acc.journeyman++;
        else if (r.earnedBadge === 'rocksteady') acc.rocksteady++;
        return acc;
      },
      { speedDemon: 0, journeyman: 0, rocksteady: 0 }
    );

    return {
      totalRides: completedRides.length,
      totalDistance,
      totalDuration,
      personalTopSpeed,
      averageRideLength: completedRides.length > 0 ? totalDistance / completedRides.length : 0,
      convoyRides,
      badges,
    };
  }, [rides]);

  const burnAllData = useCallback(() => {
    clearRides();
    setHasSeeded(true); // Mark as seeded so demo data won't come back
  }, [clearRides, setHasSeeded]);

  const seedDemoData = useCallback(() => {
    if (rides.length === 0 && !hasSeeded) {
      setRides(generateDemoRides());
      setHasSeeded(true);
    }
  }, [rides.length, hasSeeded, setRides, setHasSeeded]);

  return {
    rides,
    stats,
    addRide,
    updateRideBadge,
    deleteRide,
    burnAllData,
    seedDemoData,
  };
}
