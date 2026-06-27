import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { RideSession, RideStats, RidePhoto, RideRecording } from '@/types/blacktop';
import { useDemoMode, DEMO_STATS, DEMO_RIDES } from '@/lib/demoMode';

const RIDES_KEY = 'blacktop_rides';

export function useRideHistory() {
  const [realRides, setRides, clearRides] = useLocalStorage<RideSession[]>(RIDES_KEY, []);
  const { enabled: demoEnabled } = useDemoMode();
  // In demo mode, swap rides at the read boundary so History/RideDetail show
  // matching entries. Mutating callbacks below still target the REAL list so
  // local user data is never overwritten.
  const rides = demoEnabled ? DEMO_RIDES : realRides;

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

  const updateRideBike = useCallback((rideId: string, bikeId: string | null) => {
    setRides(prev => prev.map(r =>
      r.id === rideId ? { ...r, bikeId: bikeId || undefined } : r
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

  const setRideOverlayAvailable = useCallback((rideId: string, overlayAvailable: boolean) => {
    setRides(prev => prev.map(r =>
      r.id === rideId ? { ...r, overlayAvailable, overlayBlobUrl: overlayAvailable ? undefined : r.overlayBlobUrl } : r
    ));
  }, [setRides]);

  const clearRideOverlay = useCallback((rideId: string) => {
    setRides(prev => prev.map(r =>
      r.id === rideId ? { ...r, overlayAvailable: false, overlayBlobUrl: undefined } : r
    ));
  }, [setRides]);

  const stats: RideStats = useMemo(() => {
    if (demoEnabled) return DEMO_STATS;
    const completedRides = rides.filter(r => r.endedAt !== null);
    const totalDistance = completedRides.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = completedRides.reduce((sum, r) => sum + r.duration, 0);
    const personalTopSpeed = Math.max(0, ...completedRides.map(r => r.maxSpeed));
    const personalMaxGForce = Math.max(0, ...completedRides.map(r => r.maxGForce || 0));
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
      personalMaxGForce,
      averageRideLength: completedRides.length > 0 ? totalDistance / completedRides.length : 0,
      convoyRides,
      badges,
    };
  }, [rides, demoEnabled]);

  // Ride receipts (Ride History) are rendered on demand from `rides` and the
  // garage's bike data - there is no separate receipt image/cache stored
  // anywhere. Clearing `rides` here (plus burnGarage() at the call site, for
  // bike name/photo) already removes every input a receipt is built from, so
  // burning leaves no banked receipt behind. If a rendered-receipt cache is
  // ever added, it MUST be wiped here too.
  const burnAllData = useCallback(() => {
    clearRides();
    try { localStorage.removeItem('bt.cards.v1'); } catch {}
    try { localStorage.removeItem('bt.collected_cards.v1'); } catch {}
  }, [clearRides]);


  return {
    rides,
    stats,
    addRide,
    updateRideBadges,
    updateRideName,
    updateRideBike,
    deleteRide,
    addRidePhoto,
    removeRidePhoto,
    addRideRecording,
    markRecordingSaved,
    removeRideRecording,
    setRideOverlayAvailable,
    clearRideOverlay,
    burnAllData,
  };
}
