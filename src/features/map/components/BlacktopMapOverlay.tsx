import { X, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide } from '@/features/ride';
import { useMapOverlay, closeBlacktopMap } from '../hooks/useMapOverlay';
import { BlacktopMap } from './BlacktopMap';

export function BlacktopMapOverlay() {
  const { isOpen, destination } = useMapOverlay();
  const { rideState } = useActiveRide();
  const navigate = useNavigate();

  if (!isOpen) return null;

  // The ride lives in a module-level store with GPS running independently of
  // this overlay, so closing the map never interrupts it. When a ride is
  // active we also route back to the ride screen in case the map was opened
  // from elsewhere (Home, Settings).
  const handleExit = () => {
    closeBlacktopMap();
    if (rideState.isActive) navigate('/ride');
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-background animate-fade-in">
      <BlacktopMap initialDestination={destination} />

      {rideState.isActive ? (
        <button
          onClick={handleExit}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pl-2 pr-3 py-2 rounded-full bg-card/95 border border-border shadow-lg backdrop-blur hover:bg-secondary transition-colors text-sm font-medium"
          aria-label="Exit map and return to ride"
        >
          <ChevronLeft className="w-4 h-4" />
          Ride
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
