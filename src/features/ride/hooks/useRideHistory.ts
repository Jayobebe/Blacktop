import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { RideSession, RideStats, RidePhoto, RideRecording } from '@/types/blacktop';

const RIDES_KEY = 'blacktop_rides';

export function useRideHistory() {
  const [rides, setRides, clearRides] = useLocalStorage<RideSession[]>(RIDES_KEY, []);

  const addRide = useCallback((ride: RideSession) => {
    setRides(prev => [ride, ...prev]);
  }, [setRides]);

  const updateRideBadges = useCallback((rideId: string, badges: ('speed-demon' | 'journeyman' | 'fallback')[]) => {
    setRides(prev => prev.map(r => 
      r.id === rideId ? { ...r, earnedBadges: badges } : r
    ));
  }, [setRides]);

  const updateRideName = useCallback((rideId: string, name: string) => {
    setRides(prev => prev.map(r => 
      r.id === rideId ? { ...r, name: name.trim() || undefined } : r
    ));
  }, [setRides]);

  const deleteRide = useCallback((rideId: string) => {
    setRides(prev => prev.filter(r => r.id !== rideId));
  }, [setRides]);

  const addRidePhoto = useCallback((rideId: string, photo: RidePhoto) => {
    setRides(prev => prev.map(r => 
      r.id === rideId 
        ? { ...r, photos: [...(r.photos || []), photo] }
        : r
    ));
  }, [setRides]);

  const removeRidePhoto = useCallback((rideId: string, photoId: string) => {
    setRides(prev => prev.map(r => 
      r.id === rideId 
        ? { ...r, photos: (r.photos || []).filter(p => p.id !== photoId) }
        : r
    ));
  }, [setRides]);

  const addRideRecording = useCallback((rideId: string, recording: RideRecording) => {
    setRides(prev => prev.map(r => 
      r.id === rideId 
        ? { ...r, recording }
        : r
    ));
  }, [setRides]);

  const markRecordingSaved = useCallback((rideId: string) => {
    setRides(prev => prev.map(r => 
      r.id === rideId && r.recording
        ? { ...r, recording: { ...r.recording, savedAt: new Date().toISOString(), blobUrl: undefined } }
        : r
    ));
  }, [setRides]);

  const removeRideRecording = useCallback((rideId: string) => {
    setRides(prev => prev.map(r => 
      r.id === rideId ? { ...r, recording: undefined } : r
    ));
  }, [setRides]);

  const stats: RideStats = useMemo(() => {
    const completedRides = rides.filter(r => r.endedAt !== null);
    const totalDistance = completedRides.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = completedRides.reduce((sum, r) => sum + r.duration, 0);
    const personalTopSpeed = Math.max(0, ...completedRides.map(r => r.maxSpeed));
    const convoyRides = completedRides.filter(r => r.isConvoyRide).length;
    
    // Count badges (only from convoy rides)
    const badges = completedRides.reduce(
      (acc, r) => {
        if (r.earnedBadges) {
          r.earnedBadges.forEach(badge => {
            if (badge === 'speed-demon') acc.speedDemon++;
            else if (badge === 'journeyman') acc.journeyman++;
            else if (badge === 'fallback') acc.fallback++;
          });
        }
        return acc;
      },
      { speedDemon: 0, journeyman: 0, fallback: 0 }
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
  }, [clearRides]);

  return {
    rides,
    stats,
    addRide,
    updateRideBadges,
    updateRideName,
    deleteRide,
    addRidePhoto,
    removeRidePhoto,
    addRideRecording,
    markRecordingSaved,
    removeRideRecording,
    burnAllData,
  };
}
