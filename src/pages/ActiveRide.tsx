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
    <div className="min-h-screen flex flex-col md:flex-row bg-background p-4 safe-top safe-bottom landscape-compact md:p-6 lg:p-8">
      {/* Main content area */}
      <div className="flex-1 flex flex-col md:flex-row md:items-center md:justify-center gap-4 md:gap-8">
        {/* Speed Display - center on mobile, left on desktop */}
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in md:max-w-md">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4 md:mb-6">
            {rideState.isConvoyMode && (
              <span className="flex items-center gap-1 text-accent text-sm font-medium px-2 py-1 bg-accent/10 rounded">
                <Users className="w-4 h-4" />
                CONVOY
              </span>
            )}
            <span className="text-muted-foreground text-sm">Ride Active</span>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2">Current Speed</p>
            <div className={cn(
              "font-mono text-7xl md:text-8xl lg:text-9xl font-bold transition-all",
              rideState.currentSpeed > 80 && "text-warning animate-speed-glow",
              rideState.currentSpeed > 100 && "text-destructive"
            )}>
              {Math.round(rideState.currentSpeed)}
            </div>
            <p className="text-muted-foreground text-lg">MPH</p>
          </div>

          {/* Stats Grid - horizontal on all screens */}
          <div className="flex gap-6 md:gap-8 mt-6 md:mt-8">
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{formatDistance(rideState.distance)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Duration</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{formatDuration(rideState.duration)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max</p>
              <p className="font-mono text-xl md:text-2xl font-bold">{Math.round(rideState.maxSpeed)}</p>
            </div>
          </div>
        </div>

        {/* Right side controls - stacked on mobile, column on desktop */}
        <div className="flex flex-row md:flex-col items-center justify-center gap-4 md:gap-6 md:w-48">
          {/* Navigation button */}
          <Button
            variant="ghost"
            onClick={() => openNavigation()}
            className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-secondary hover:bg-muted touch-target"
          >
            <Navigation className="w-6 h-6 md:w-7 md:h-7" />
          </Button>

          {/* Voice Toggle Button (Convoy Mode Only) */}
          {rideState.isConvoyMode && (
            <div className="flex flex-col items-center">
              <button
                onClick={toggleMute}
                className={cn(
                  "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all touch-target-lg",
                  !isMuted
                    ? "bg-ptt-active scale-105 animate-ptt-pulse shadow-glow"
                    : "bg-ptt-inactive hover:bg-muted"
                )}
              >
                {isMuted ? (
                  <MicOff className="w-8 h-8 md:w-10 md:h-10 text-foreground" />
                ) : (
                  <Mic className="w-8 h-8 md:w-10 md:h-10 text-background" />
                )}
              </button>
              <p className={cn(
                "mt-2 text-xs md:text-sm font-medium transition-colors",
                !isMuted ? "text-accent" : "text-muted-foreground"
              )}>
                {isMuted ? "Muted" : "Live"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* End Ride Button - bottom on mobile, fixed position on desktop */}
      <div className="mt-4 md:mt-0 md:absolute md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-auto animate-slide-up delay-100">
        {!showEndConfirm ? (
          <Button
            onClick={() => setShowEndConfirm(true)}
            variant="outline"
            className="w-full md:w-auto md:min-w-[200px] h-12 md:h-14 text-base md:text-lg font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <Square className="w-4 h-4 md:w-5 md:h-5 mr-2" />
            END RIDE
          </Button>
        ) : (
          <div className="flex flex-col md:flex-row gap-2 md:gap-3">
            <Button
              onClick={handleEndRide}
              className="h-12 md:h-14 md:min-w-[200px] text-base md:text-lg font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              CONFIRM END
            </Button>
            <Button
              onClick={() => setShowEndConfirm(false)}
              variant="ghost"
              className="h-10 md:h-14 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
