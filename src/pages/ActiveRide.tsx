import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { useNavigation } from '@/hooks/useNavigation';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useSettings } from '@/hooks/useSettings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useProfile } from '@/hooks/useProfile';
import { ConvoyMemberInfo, BadgeType } from '@/types/convoy';
import { GpsStatus } from '@/types/blacktop';
import { RideSummary } from '@/components/RideSummary';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, Navigation, Users, Crown, User, Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// GPS Signal Indicator Component
function GpsIndicator({ gpsStatus }: { gpsStatus: GpsStatus }) {
  const timeSinceUpdate = gpsStatus.lastUpdate 
    ? Math.floor((Date.now() - gpsStatus.lastUpdate) / 1000)
    : null;
  
  const isStale = timeSinceUpdate !== null && timeSinceUpdate > 5;
  const accuracy = gpsStatus.accuracy;
  
  // Determine signal quality
  let SignalIcon = Signal;
  let signalColor = 'text-muted-foreground/50';
  let title = 'Waiting for GPS...';
  
  if (gpsStatus.source !== 'none' && !isStale) {
    if (accuracy !== null && accuracy <= 10) {
      SignalIcon = SignalHigh;
      signalColor = 'text-emerald-400';
      title = `GPS: Excellent (±${Math.round(accuracy)}m)`;
    } else if (accuracy !== null && accuracy <= 30) {
      SignalIcon = SignalMedium;
      signalColor = 'text-accent';
      title = `GPS: Good (±${Math.round(accuracy)}m)`;
    } else if (accuracy !== null && accuracy <= 100) {
      SignalIcon = SignalLow;
      signalColor = 'text-yellow-400';
      title = `GPS: Fair (±${Math.round(accuracy)}m)`;
    } else {
      SignalIcon = SignalLow;
      signalColor = 'text-orange-400';
      title = accuracy ? `GPS: Weak (±${Math.round(accuracy)}m)` : 'GPS: Active';
    }
  } else if (isStale) {
    signalColor = 'text-destructive/70';
    title = 'GPS signal lost';
  }
  
  return (
    <div className="flex items-center gap-1" title={title}>
      <SignalIcon className={cn("w-3.5 h-3.5 transition-colors", signalColor)} />
    </div>
  );
}

// Member colors for visual distinction
const MEMBER_COLORS = [
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: 'ring-emerald-500/50' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500/50' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', ring: 'ring-purple-500/50' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', ring: 'ring-orange-500/50' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', ring: 'ring-pink-500/50' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', ring: 'ring-cyan-500/50' },
];

export default function ActiveRide() {
  const navigate = useNavigate();
  const { rideState, endRide } = useActiveRide();
  const { convoy, resetNavigationStatus, endConvoyRide } = useConvoyState();
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id);
  const { openNavigation } = useNavigation();
  const { settings } = useSettings();
  const { updateRideBadge } = useRideHistory();
  const { user } = useProfile();
  const wakeLock = useWakeLock();
  // Keep audio session alive in background only when in convoy with other members
  useBackgroundAudio(rideState.isConvoyMode && isConnected && convoy.members.length > 1);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [endingFlow, setEndingFlow] = useState(false);
  const [finalMembers, setFinalMembers] = useState<ConvoyMemberInfo[]>([]);
  const [savedRideId, setSavedRideId] = useState<string | null>(null);
  const [finalRideStats, setFinalRideStats] = useState<{ duration: number; distance: number; maxSpeed: number; averageSpeed: number } | null>(null);
  const membersRef = useRef<ConvoyMemberInfo[]>([]);

  // Keep screen awake during active ride
  useEffect(() => {
    if (rideState.isActive) {
      wakeLock.request();
    }
    return () => {
      wakeLock.release();
    };
  }, [rideState.isActive]);

  // Keep track of members for when ride ends
  useEffect(() => {
    if (convoy.members.length > 0) {
      membersRef.current = convoy.members;
    }
  }, [convoy.members]);

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

  // Redirect if no active ride (but don't interrupt the explicit "end ride" flow / summary)
  useEffect(() => {
    if (!rideState.isActive && !showSummary && !endingFlow) {
      navigate('/');
    }
  }, [rideState.isActive, showSummary, endingFlow, navigate]);

  // Non-leaders: listen for leader ending the ride (destination cleared)
  useEffect(() => {
    if (!(rideState.isConvoyMode && !convoy.isLeader && rideState.isActive)) return;

    // If we're in convoy mode, not the leader, and destination gets cleared, leader ended the ride
    if (convoy.isActive && !convoy.destination) {
      toast.info('Leader ended the ride');
      setEndingFlow(true);
      (async () => {
        await endRide();
        navigate('/lobby');
      })();
    }
  }, [
    convoy.destination,
    convoy.isLeader,
    convoy.isActive,
    rideState.isConvoyMode,
    rideState.isActive,
    endRide,
    navigate,
  ]);

  const handleEndRide = async () => {
    setEndingFlow(true);

    if (isConnected) {
      disconnect();
    }

    const wasConvoyMode = rideState.isConvoyMode;
    const wasLeader = convoy.isLeader;

    // Capture final ride stats before ending
    const avgSpeed = rideState.duration > 0 ? (rideState.distance / (rideState.duration / 3600)) : 0;
    setFinalRideStats({
      duration: rideState.duration,
      distance: rideState.distance,
      maxSpeed: rideState.maxSpeed,
      averageSpeed: avgSpeed,
    });

    // Capture final members before ending for badge summary
    if (wasConvoyMode && membersRef.current.length > 0) {
      setFinalMembers(membersRef.current);
    }

    const rideId = await endRide();
    setSavedRideId(rideId);

    if (wasConvoyMode) {
      if (wasLeader) {
        // Leader ends ride for everyone
        await endConvoyRide();
      } else {
        // Member just resets their own status
        await resetNavigationStatus();
      }
      // Show summary before navigating
      setShowSummary(true);
    } else {
      navigate('/');
    }
  };

  const handleBadgeEarned = useCallback((badge: BadgeType) => {
    if (savedRideId) {
      updateRideBadge(savedRideId, badge);
    }
  }, [savedRideId, updateRideBadge]);

  const handleCloseSummary = () => {
    setShowSummary(false);
    navigate('/lobby');
  };

  // Show summary after convoy ride ends
  if (showSummary && finalMembers.length > 0) {
    return (
      <RideSummary 
        members={finalMembers} 
        currentUserId={user?.id}
        rideStats={finalRideStats || undefined}
        onBadgeEarned={handleBadgeEarned}
        onClose={handleCloseSummary} 
      />
    );
  }

  if (!rideState.isActive) return null;

  // Sort members by top speed (highest first) if rankings enabled, otherwise by join time
  const sortedMembers = settings.showSpeedRankings 
    ? [...convoy.members].sort((a, b) => (b.topSpeed || 0) - (a.topSpeed || 0))
    : convoy.members;

  const getMemberColor = (index: number, isLeader: boolean) => {
    if (isLeader) return { bg: 'bg-accent/20', text: 'text-accent', ring: 'ring-accent/50' };
    return MEMBER_COLORS[index % MEMBER_COLORS.length];
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-background p-3 safe-top safe-bottom md:p-4 lg:p-6">
      {/* Main content area - vertical in portrait, horizontal in landscape */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-3 md:gap-4 min-h-0 overflow-hidden">
        {/* Speed and Stats */}
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in min-w-0">
          {/* Header - compact */}
          <div className="flex items-center gap-2 mb-2 landscape:mb-1 md:mb-4">
            {rideState.isConvoyMode && (
              <span className="flex items-center gap-1 text-accent text-xs font-medium px-2 py-0.5 bg-accent/10 rounded">
                <Users className="w-3 h-3" />
                {convoy.isLeader ? 'LEADER' : 'CONVOY'}
              </span>
            )}
            <GpsIndicator gpsStatus={rideState.gpsStatus} />
          </div>

          {/* Speed Display - responsive sizing */}
          <div className="text-center">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1 landscape:hidden">Speed</p>
            <div className={cn(
              "font-mono font-bold transition-all leading-none",
              "text-6xl md:text-7xl lg:text-8xl landscape:text-5xl",
              formatSpeed(rideState.currentSpeed, settings.speedUnit) > (settings.speedUnit === 'kph' ? 130 : 80) && "text-warning animate-speed-glow",
              formatSpeed(rideState.currentSpeed, settings.speedUnit) > (settings.speedUnit === 'kph' ? 160 : 100) && "text-destructive"
            )}>
              {formatSpeed(rideState.currentSpeed, settings.speedUnit)}
            </div>
            <p className="text-muted-foreground text-xs">{getSpeedLabel(settings.speedUnit)}</p>
          </div>

          {/* Stats Row - compact horizontal */}
          <div className="flex gap-4 md:gap-6 mt-3 landscape:mt-2 md:mt-4">
            <div className="text-center">
              <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Dist</p>
              <p className="font-mono text-base landscape:text-sm md:text-lg font-bold">
                {formatDistance(rideState.distance, settings.distanceUnit)}
                <span className="text-[10px] text-muted-foreground ml-0.5">{getDistanceLabel(settings.distanceUnit)}</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Time</p>
              <p className="font-mono text-base landscape:text-sm md:text-lg font-bold">{formatDuration(rideState.duration)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Max</p>
              <p className="font-mono text-base landscape:text-sm md:text-lg font-bold">{formatSpeed(rideState.maxSpeed, settings.speedUnit)}</p>
            </div>
          </div>
        </div>

        {/* Controls - row in portrait, column in landscape */}
        <div className="flex landscape:flex-col items-center justify-center gap-3 landscape:gap-2 px-2">
          {/* Navigation button */}
          <Button
            variant="ghost"
            onClick={() => openNavigation()}
            className="h-12 w-12 landscape:h-10 landscape:w-10 rounded-full bg-secondary hover:bg-muted touch-target"
          >
            <Navigation className="w-6 h-6 landscape:w-5 landscape:h-5" />
          </Button>

          {/* Voice Toggle Button (Convoy Mode Only) */}
          {rideState.isConvoyMode && (
            <button
              onClick={toggleMute}
              className={cn(
                "w-16 h-16 landscape:w-14 landscape:h-14 rounded-full flex items-center justify-center transition-all touch-target",
                !isMuted
                  ? "bg-ptt-active scale-105 animate-ptt-pulse shadow-glow"
                  : "bg-ptt-inactive hover:bg-muted"
              )}
            >
              {isMuted ? (
                <MicOff className="w-7 h-7 landscape:w-6 landscape:h-6 text-foreground" />
              ) : (
                <Mic className="w-7 h-7 landscape:w-6 landscape:h-6 text-background" />
              )}
            </button>
          )}

          {/* Toggle members panel button */}
          {rideState.isConvoyMode && (
            <Button
              variant="ghost"
              onClick={() => setShowMembers(!showMembers)}
              className={cn(
                "h-12 w-12 landscape:h-10 landscape:w-10 rounded-full touch-target",
                showMembers ? "bg-accent/20 text-accent" : "bg-secondary hover:bg-muted"
              )}
            >
              <Users className="w-6 h-6 landscape:w-5 landscape:h-5" />
            </Button>
          )}
        </div>

        {/* Convoy Members Panel - bottom in portrait, right side in landscape */}
        {rideState.isConvoyMode && showMembers && (
          <div className="landscape:w-56 md:landscape:w-64 animate-slide-up flex-shrink-0 max-h-[30vh] landscape:max-h-none overflow-hidden">
            <div className="bg-card border border-border rounded-xl p-2 md:p-3 h-full flex flex-col">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Convoy ({convoy.members.length})
              </h3>
              
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {sortedMembers.map((member, index) => {
                  const color = getMemberColor(index, member.isLeader);
                  const isSpeaking = speakingUsers.has(member.userId);
                  
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 p-1.5 rounded-lg border transition-all",
                        color.bg,
                        isSpeaking ? `ring-1 ${color.ring} border-transparent` : "border-border/50"
                      )}
                    >
                      {/* Avatar with speaking glow */}
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                        color.bg,
                        isSpeaking && "shadow-[0_0_8px_2px] shadow-accent/60 scale-105"
                      )}>
                        {member.isLeader ? (
                          <Crown className={cn("w-3.5 h-3.5", color.text)} />
                        ) : (
                          <User className={cn("w-3.5 h-3.5", color.text)} />
                        )}
                      </div>
                      
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-xs truncate", color.text)}>
                          {member.name}
                          {isSpeaking && <span className="ml-1 text-[10px] opacity-75">🎤</span>}
                        </p>
                        {settings.showSpeedRankings && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatSpeed(member.currentSpeed || 0, settings.speedUnit)} {settings.speedUnit}
                          </p>
                        )}
                      </div>
                      
                      {/* Top speed badge - compact */}
                      {settings.showSpeedRankings && (
                        <div className="text-right flex-shrink-0">
                          <p className={cn("font-mono text-xs font-bold", color.text)}>
                            {formatSpeed(member.topSpeed || 0, settings.speedUnit)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* End Ride Button - always at bottom, compact */}
      <div className="mt-2 md:mt-3 flex justify-center animate-slide-up">
        {!showEndConfirm ? (
          <Button
            onClick={() => setShowEndConfirm(true)}
            variant="outline"
            size="sm"
            className="h-9 md:h-10 px-4 text-sm font-semibold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Square className="w-3.5 h-3.5 mr-1.5" />
            {rideState.isConvoyMode && convoy.isLeader ? 'END CONVOY' : 'END RIDE'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleEndRide}
              size="sm"
              className="h-9 md:h-10 px-4 text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {rideState.isConvoyMode && convoy.isLeader ? 'END FOR ALL' : 'CONFIRM'}
            </Button>
            <Button
              onClick={() => setShowEndConfirm(false)}
              variant="ghost"
              size="sm"
              className="h-9 md:h-10"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
