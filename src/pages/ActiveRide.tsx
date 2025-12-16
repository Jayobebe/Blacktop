import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { useNavigation } from '@/hooks/useNavigation';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, Navigation, Users } from 'lucide-react';
import { formatDuration, formatDistance } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ActiveRide() {
  const navigate = useNavigate();
  const { rideState, endRide } = useActiveRide();
  const { isConnected, isMuted, connect, disconnect, toggleMute } = useVoiceChannel();
  const { openNavigation } = useNavigation();
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Connect to voice channel if convoy mode
  useEffect(() => {
    if (rideState.isConvoyMode && !isConnected) {
      connect();
    }
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [rideState.isConvoyMode]);

  // Redirect if no active ride
  useEffect(() => {
    if (!rideState.isActive) {
      navigate('/');
    }
  }, [rideState.isActive, navigate]);

  const handleEndRide = () => {
    if (isConnected) {
      disconnect();
    }
    endRide();
    navigate('/');
  };

  if (!rideState.isActive) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {rideState.isConvoyMode && (
            <span className="flex items-center gap-1 text-accent text-sm font-medium px-2 py-1 bg-accent/10 rounded">
              <Users className="w-4 h-4" />
              CONVOY
            </span>
          )}
          <span className="text-muted-foreground text-sm">Ride Active</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openNavigation()}
          className="touch-target"
        >
          <Navigation className="w-5 h-5" />
        </Button>
      </header>

      {/* Speed Display */}
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
        <div className="text-center mb-8">
          <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2">Current Speed</p>
          <div className={cn(
            "font-mono text-8xl font-bold transition-all",
            rideState.currentSpeed > 80 && "text-warning animate-speed-glow",
            rideState.currentSpeed > 100 && "text-destructive"
          )}>
            {Math.round(rideState.currentSpeed)}
          </div>
          <p className="text-muted-foreground text-lg">MPH</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8">
          <div className="text-center">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
            <p className="font-mono text-xl font-bold">{formatDistance(rideState.distance)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Duration</p>
            <p className="font-mono text-xl font-bold">{formatDuration(rideState.duration)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max Speed</p>
            <p className="font-mono text-xl font-bold">{Math.round(rideState.maxSpeed)}</p>
          </div>
        </div>
      </div>

      {/* Voice Toggle Button (Convoy Mode Only) */}
      {rideState.isConvoyMode && (
        <div className="flex flex-col items-center mb-6 animate-slide-up">
          <button
            onClick={toggleMute}
            className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center transition-all touch-target-lg",
              !isMuted
                ? "bg-ptt-active scale-105 animate-ptt-pulse shadow-glow"
                : "bg-ptt-inactive hover:bg-muted"
            )}
          >
            {isMuted ? (
              <MicOff className="w-10 h-10 text-foreground" />
            ) : (
              <Mic className="w-10 h-10 text-background" />
            )}
          </button>
          <p className={cn(
            "mt-3 text-sm font-medium transition-colors",
            !isMuted ? "text-accent" : "text-muted-foreground"
          )}>
            {isMuted ? "Tap to unmute" : "Live"}
          </p>
        </div>
      )}

      {/* End Ride Button */}
      <div className="animate-slide-up delay-100">
        {!showEndConfirm ? (
          <Button
            onClick={() => setShowEndConfirm(true)}
            variant="outline"
            className="w-full h-14 text-lg font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <Square className="w-5 h-5 mr-2" />
            END RIDE
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleEndRide}
              className="w-full h-14 text-lg font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              CONFIRM END RIDE
            </Button>
            <Button
              onClick={() => setShowEndConfirm(false)}
              variant="ghost"
              className="w-full h-12 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
