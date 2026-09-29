import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useActiveRide } from '@/features/ride';
import { useMapOverlay, closeBlacktopMap, resetBlacktopMap } from '../hooks/useMapOverlay';
import { BlacktopMap } from './BlacktopMap';
import { cn } from '@/lib/utils';
import { useWakeLock } from '@/hooks/useWakeLock';
import { MapLoading } from '@/components/MapLoading';
import { tr } from '@/lib/i18n';

export function BlacktopMapOverlay() {
  const { isOpen, destination, ready, resetSeq } = useMapOverlay();
  const { rideState } = useActiveRide();
  const navigate = useNavigate();
  const location = useLocation();
  const [mountKey, setMountKey] = useState(0);

  const inLobby = !rideState.isActive && location.pathname === '/lobby';

  // The map keeps the screen on during a ride or when opened from a lobby,
  // whichever page is underneath it.
  const wakeLock = useWakeLock();
  const keepAwake =
    isOpen && (rideState.isActive || location.pathname === '/lobby' || location.pathname === '/solo-lobby');
  useEffect(() => {
    if (!keepAwake) return;
    void wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepAwake]);

  // Don't unmount — use CSS to hide so BlacktopMap retains its MapLibre
  // instance, route geometry, and cached tiles across open/close cycles.
  const handleExit = () => {
    closeBlacktopMap();
    if (rideState.isActive) navigate('/ride');
  };

  // Leaving the home map (the X, or the inactivity auto-close) ends its route
  // and navigation. A ride's map keeps its route until the ride ends, and a
  // lobby's map keeps the plan the lobby is building.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (wasOpen.current && !isOpen && !rideState.isActive && !inLobby) resetBlacktopMap();
    wasOpen.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div className={cn(
      'fixed inset-0 z-[1000]',
      // Until the map has drawn, the app backdrop (brought in front of the
      // page, belts sped up) is the loading screen; then the map fades in.
      ready ? 'bg-background' : 'bg-transparent',
      isOpen ? 'animate-fade-in' : 'hidden',
    )}>
      <div className={cn('absolute inset-0 transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')}>
        <BlacktopMap
          key={mountKey}
          initialDestination={destination}
          onContextLost={() => setMountKey((k) => k + 1)}
          isVisible={isOpen}
          resetSeq={resetSeq}
        />
      </div>
      {isOpen && !ready && <MapLoading />}

      {rideState.isActive ? (
        <button
          onClick={handleExit}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pl-2 pr-3 py-2 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors text-sm font-medium"
          aria-label={tr("Exit map and return to ride")}
        >
          <ChevronLeft className="w-4 h-4" />
          {tr("Ride")}
        </button>
      ) : inLobby ? (
        <button
          onClick={() => closeBlacktopMap()}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pl-2 pr-3 py-2 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors text-sm font-medium"
          aria-label={tr("Back to lobby")}
        >
          <ChevronLeft className="w-4 h-4" />
          {tr("Lobby")}
        </button>
      ) : (
        <button
          onClick={handleExit}
          className="absolute bottom-3 right-3 z-20 p-2.5 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors"
          aria-label={tr("Close map")}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
