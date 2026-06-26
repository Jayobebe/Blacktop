import { useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useActiveRide } from '@/features/ride';
import { useMapOverlay, closeBlacktopMap } from '../hooks/useMapOverlay';
import { BlacktopMap } from './BlacktopMap';
import { cn } from '@/lib/utils';

export function BlacktopMapOverlay() {
  const { isOpen, destination } = useMapOverlay();
  const { rideState } = useActiveRide();
  const navigate = useNavigate();
  const location = useLocation();
  const [mountKey, setMountKey] = useState(0);

  // Don't unmount — use CSS to hide so BlacktopMap retains its MapLibre
  // instance, route geometry, and cached tiles across open/close cycles.
  const handleExit = () => {
    closeBlacktopMap();
    if (rideState.isActive) navigate('/ride');
  };

  const inLobby = !rideState.isActive && location.pathname === '/lobby';

  return (
    <div className={cn(
      'fixed inset-0 z-[1000] bg-background',
      isOpen ? 'animate-fade-in' : 'hidden',
    )}>
      <BlacktopMap
        key={mountKey}
        initialDestination={destination}
        onContextLost={() => setMountKey((k) => k + 1)}
        isVisible={isOpen}
      />

      {rideState.isActive ? (
        <button
          onClick={handleExit}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pl-2 pr-3 py-2 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors text-sm font-medium"
          aria-label="Exit map and return to ride"
        >
          <ChevronLeft className="w-4 h-4" />
          Ride
        </button>
      ) : inLobby ? (
        <button
          onClick={() => closeBlacktopMap()}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pl-2 pr-3 py-2 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors text-sm font-medium"
          aria-label="Back to lobby"
        >
          <ChevronLeft className="w-4 h-4" />
          Lobby
        </button>
      ) : (
        <button
          onClick={handleExit}
          className="absolute bottom-3 right-3 z-20 p-2.5 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors"
          aria-label="Close map"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
