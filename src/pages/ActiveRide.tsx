import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useActiveRide, useRideHistory, RideSummary } from '@/features/ride';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';
import { useNavigation } from '@/hooks/useNavigation';
import { useConvoyState } from '@/features/convoy';
import { useSettings } from '@/features/settings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';
import { useProfile } from '@/features/profile';
import { useRescue, RescueAlert } from '@/features/rescue';
import { useWaypoints } from '@/features/waypoints';
import { supabase } from '@/integrations/supabase/client';
import { ConvoyMemberInfo, BadgeType } from '@/types/convoy';
import { GpsStatus } from '@/types/blacktop';
import { Button } from '@/components/ui/button';
import { Square, Mic, MicOff, PhoneOff, Phone, Navigation, Users, Crown, User, Signal, SignalLow, SignalMedium, SignalHigh, AlertTriangle, Pause, Play } from 'lucide-react';
import { formatDuration, formatDistance, formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getMemberColorStyles } from '@/lib/memberColors';

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

// Get color styles for a member based on their accent color
const getMemberStyles = (member: ConvoyMemberInfo) => {
  return getMemberColorStyles(member.accentColor);
};

export default function ActiveRide() {
  const navigate = useNavigate();
  const { rideState, endRide, setRidePaused } = useActiveRide();
  const { convoy, resetNavigationStatus, endConvoyRide } = useConvoyState();
  // Only use voice channel for convoy rides with other members
  const voiceChannel = useVoiceChannel(rideState.isConvoyMode ? convoy.id : undefined);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = voiceChannel;
  const { openNavigation } = useNavigation();
  const { settings } = useSettings();
  const { updateRideBadges } = useRideHistory();
  const { user, profile } = useProfile();
  const wakeLock = useWakeLock();
  const { addWaypoint } = useWaypoints(convoy.id, convoy.isLeader);
  const { 
    rescueRequests, 
    hasPendingRescue, 
    sendRescueRequest, 
    acknowledgeRescue, 
    dismissRescue,
    cancelRescueRequest 
  } = useRescue(convoy.id, convoy.isLeader, user?.id || null, profile.name || null);
  
  // Keep audio session alive in background only when in convoy with other members
  useBackgroundAudio(rideState.isConvoyMode && isConnected && convoy.members.length > 1);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [endingFlow, setEndingFlow] = useState(false);
  const [finalMembers, setFinalMembers] = useState<ConvoyMemberInfo[]>([]);
  const [savedRideId, setSavedRideId] = useState<string | null>(null);
  const [pendingBadges, setPendingBadges] = useState<BadgeType[]>([]);
  const [finalRideStats, setFinalRideStats] = useState<{ duration: number; distance: number; maxSpeed: number; averageSpeed: number } | null>(null);
  const membersRef = useRef<ConvoyMemberInfo[]>([]);
  const controlChannelRef = useRef<any>(null); // Control channel for ride commands from leader
  const rideStateRef = useRef(rideState); // Keep fresh ref for broadcast handler
  
  // Update ref on each render to avoid stale closures
  rideStateRef.current = rideState;

  // Save pending badges once savedRideId becomes available
  useEffect(() => {
    if (savedRideId && pendingBadges.length > 0) {
      console.log('[ActiveRide] Saving pending badges:', pendingBadges, 'to ride:', savedRideId);
      updateRideBadges(savedRideId, pendingBadges);
      setPendingBadges([]); // Clear after saving
    }
  }, [savedRideId, pendingBadges, updateRideBadges]);

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

  // Cleanup voice channel on unmount (no auto-connect - users must explicitly join)
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [isConnected, disconnect]);

  // Redirect if no active ride (but don't interrupt the explicit "end ride" flow / summary)
  useEffect(() => {
    if (!rideState.isActive && !showSummary && !endingFlow) {
      navigate('/');
    }
  }, [rideState.isActive, showSummary, endingFlow, navigate]);

  // Refs for stable access in callbacks (avoid stale closures)
  const voiceChannelRef = useRef({ isConnected, disconnect });
  voiceChannelRef.current = { isConnected, disconnect };
  const endingFlowRef = useRef(endingFlow);
  endingFlowRef.current = endingFlow;
  const convoyMembersRef = useRef(convoy.members);
  convoyMembersRef.current = convoy.members;

  // Helper function to handle ride end (reusable for both broadcast and realtime)
  const handleRideEndedByLeader = useCallback(() => {
    if (endingFlowRef.current) return; // Already ending
    console.log('[ActiveRide] Ride ended by leader');
    toast.info('Leader ended the ride');
    
    // Use flushSync to ensure state updates are applied BEFORE endRide() triggers external store re-render
    flushSync(() => {
      setEndingFlow(true);
      
      // Capture final ride stats before ending (use ref for fresh state)
      const currentRideState = rideStateRef.current;
      const avgSpeed = currentRideState.duration > 0 ? (currentRideState.distance / (currentRideState.duration / 3600)) : 0;
      setFinalRideStats({
        duration: currentRideState.duration,
        distance: currentRideState.distance,
        maxSpeed: currentRideState.maxSpeed,
        averageSpeed: avgSpeed,
      });
      
      // Capture final members for badge summary - use membersRef first, fallback to current convoy.members
      const members = membersRef.current.length > 0 ? membersRef.current : convoyMembersRef.current;
      if (members.length > 0) {
        setFinalMembers(members);
      }
      
      // Show summary immediately
      setShowSummary(true);
    });
    
    // Disconnect voice (use ref for fresh values)
    if (voiceChannelRef.current.isConnected) {
      voiceChannelRef.current.disconnect();
    }
    
    // Run cleanup in background (non-blocking)
    (async () => {
      const rideId = await endRide();
      setSavedRideId(rideId);
      resetNavigationStatus().catch(err => console.warn('[ActiveRide] Cleanup error:', err));
    })();
  }, [endRide, resetNavigationStatus]);

  // Subscribe to convoy control channel for broadcasts AND realtime convoy changes
  useEffect(() => {
    if (!convoy.id || !rideState.isConvoyMode) return;

    // Control channel for broadcasts (pause/resume/end-ride)
    const controlChannel = supabase.channel(`convoy-control:${convoy.id}`, {
      config: { broadcast: { self: false } },
    });

    controlChannel.on('broadcast', { event: 'end-ride' }, () => {
      handleRideEndedByLeader();
    });

    controlChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[ActiveRide] Subscribed to convoy control channel');
      }
    });

    controlChannelRef.current = controlChannel;

    // DURABLE: Also subscribe to realtime convoy changes to detect ride_ended_at
    // This ensures non-leaders end their ride even if they missed the broadcast
    const realtimeChannel = supabase
      .channel(`convoy-realtime:${convoy.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'convoys',
          filter: `id=eq.${convoy.id}`,
        },
        (payload) => {
          const newConvoy = payload.new as any;
          // If ride_ended_at is set and we're not the leader, end our ride
          if (newConvoy.ride_ended_at && !convoy.isLeader) {
            console.log('[ActiveRide] Detected ride_ended_at via realtime');
            handleRideEndedByLeader();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(controlChannel);
      supabase.removeChannel(realtimeChannel);
      controlChannelRef.current = null;
    };
  }, [convoy.id, convoy.isLeader, rideState.isConvoyMode, handleRideEndedByLeader]);

  const handleEndRide = async () => {
    // Use flushSync to ensure state updates are applied BEFORE endRide() triggers external store re-render
    flushSync(() => {
      setEndingFlow(true);
    });

    // Disconnect voice immediately (non-blocking)
    if (isConnected) {
      disconnect();
    }

    const wasConvoyMode = rideState.isConvoyMode;
    const wasLeader = convoy.isLeader;
    const convoyId = convoy.id;

    // Capture final ride stats before ending
    const avgSpeed = rideState.duration > 0 ? (rideState.distance / (rideState.duration / 3600)) : 0;
    
    // Use flushSync to ensure state is applied before endRide
    flushSync(() => {
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
    });

    // CRITICAL: If leader in convoy mode, set ride_ended_at AND broadcast 'end-ride'
    if (wasConvoyMode && wasLeader && convoyId) {
      console.log('[ActiveRide] Leader ending ride for all members');
      
      // Set ride_ended_at in database (durable - survives missed broadcasts)
      await supabase
        .from('convoys')
        .update({ ride_ended_at: new Date().toISOString() })
        .eq('id', convoyId);
      
      // Also broadcast for immediate notification (best effort)
      try {
        const broadcastChannel = supabase.channel(`convoy-control:${convoyId}`, {
          config: { broadcast: { self: false } },
        });

        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              supabase.removeChannel(broadcastChannel);
              resolve();
            }
          };

          const timeout = setTimeout(done, 1500);

          broadcastChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              try {
                await broadcastChannel.send({
                  type: 'broadcast',
                  event: 'end-ride',
                  payload: { at: Date.now() },
                });
                console.log('[ActiveRide] End-ride broadcast sent');
              } catch (err) {
                console.error('[ActiveRide] Broadcast error:', err);
              }
              clearTimeout(timeout);
              setTimeout(done, 100);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout);
              done();
            }
          });
        });
      } catch (err) {
        console.error('[ActiveRide] Broadcast failed:', err);
      }
    }

    // ALWAYS show summary for every ride (solo or convoy) - flush before endRide
    flushSync(() => {
      setShowSummary(true);
    });

    // Now safe to end the ride (control channel broadcast already sent)
    const rideId = await endRide();
    setSavedRideId(rideId);

    // Cleanup convoy state in background
    const cleanupPromises: Promise<any>[] = [];
    if (wasConvoyMode) {
      if (wasLeader) {
        cleanupPromises.push(endConvoyRide());
      } else {
        cleanupPromises.push(resetNavigationStatus());
      }
    }

    // Wait for cleanup but don't block UI
    Promise.all(cleanupPromises).catch(err => {
      console.warn('[ActiveRide] Cleanup error:', err);
    });
  };

  const handleBadgesEarned = useCallback((badges: BadgeType[]) => {
    // Only save badges for convoy rides with 2+ members - solo rides never earn badges
    // RideSummary already gates this callback - it only calls when members.length >= 2
    // Use finalMembers (captured at ride end) since convoy.members may be empty by now
    if (badges.length > 0 && rideState.isConvoyMode && finalMembers.length >= 2) {
      console.log('[ActiveRide] Badges earned:', badges);
      // Store badges - they'll be saved when savedRideId becomes available
      setPendingBadges(badges);
    }
  }, [rideState.isConvoyMode, finalMembers.length]);

  const handleCloseSummary = () => {
    setShowSummary(false);
    // Navigate to lobby for convoy rides, home for solo rides
    if (finalMembers.length > 0) {
      navigate('/lobby');
    } else {
      navigate('/');
    }
  };

  const handleRescue = async () => {
    // Get current location from ride state or request fresh position
    const gpsPoints = rideState.gpsPoints;
    if (gpsPoints.length > 0) {
      const lastPoint = gpsPoints[gpsPoints.length - 1];
      await sendRescueRequest(lastPoint.lat, lastPoint.lng);
    } else {
      // Try to get current position
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await sendRescueRequest(position.coords.latitude, position.coords.longitude);
        },
        () => {
          toast.error('Unable to get your location');
        }
      );
    }
  };

  const handleAddRescueWaypoint = async (request: typeof rescueRequests[0]) => {
    console.log('[ActiveRide] Adding rescue waypoint for', request.userName);
    const success = await addWaypoint({
      name: `Rescue: ${request.userName}`,
      address: `Lat: ${request.lat.toFixed(4)}, Lng: ${request.lng.toFixed(4)}`,
      lat: request.lat,
      lng: request.lng,
    });
    
    if (success) {
      // Pass riderName for toast confirmation to both leader and rescuee
      await acknowledgeRescue(request.id, request.userId, request.userName);
    } else {
      console.error('[ActiveRide] Failed to add rescue waypoint');
      toast.error('Failed to add rescue waypoint');
    }
  };

  // Show summary after convoy ride ends - show if we have stats even if no members (solo ride)
  if (showSummary) {
    return (
      <RideSummary 
        members={finalMembers} 
        currentUserId={user?.id}
        rideStats={finalRideStats || undefined}
        onBadgesEarned={handleBadgesEarned}
        onClose={handleCloseSummary} 
      />
    );
  }

  if (!rideState.isActive && !endingFlow) return null;

  // Sort members by top speed (highest first) if rankings enabled, otherwise by join time
  const sortedMembers = settings.showSpeedRankings 
    ? [...convoy.members].sort((a, b) => (b.topSpeed || 0) - (a.topSpeed || 0))
    : convoy.members;


  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-background p-3 safe-top safe-bottom md:p-4 lg:p-6">
      {/* Rescue Alerts (Leader only) */}
      {convoy.isLeader && (
        <RescueAlert
          requests={rescueRequests}
          onAddWaypoint={handleAddRescueWaypoint}
          onDismiss={dismissRescue}
        />
      )}

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
            {rideState.isPaused && (
              <span className="flex items-center gap-1 text-warning text-xs font-medium px-2 py-0.5 bg-warning/10 rounded animate-pulse">
                <Pause className="w-3 h-3" />
                PAUSED
              </span>
            )}
            <GpsIndicator gpsStatus={rideState.gpsStatus} />
          </div>

          {/* Speed Display - large and prominent */}
          <div className="text-center">
            <div className={cn(
              "font-mono font-black transition-all leading-none",
              "text-[7rem] md:text-[11rem] lg:text-[14rem] landscape:text-[5.5rem]",
              formatSpeed(rideState.currentSpeed, settings.speedUnit) >= settings.redSpeedThreshold && "text-destructive animate-speed-glow-red",
              formatSpeed(rideState.currentSpeed, settings.speedUnit) >= settings.amberSpeedThreshold && 
              formatSpeed(rideState.currentSpeed, settings.speedUnit) < settings.redSpeedThreshold && "text-warning animate-speed-glow"
            )}>
              {formatSpeed(rideState.currentSpeed, settings.speedUnit)}
            </div>
            <p className="text-muted-foreground text-base landscape:text-sm -mt-3">{getSpeedLabel(settings.speedUnit)}</p>
          </div>

          {/* Stats Row - larger and more visible */}
          <div className="flex gap-8 md:gap-14 mt-3 landscape:mt-2 md:mt-5">
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
              <p className="font-mono text-2xl landscape:text-xl md:text-4xl font-bold truncate">
                {formatDistance(rideState.distance, settings.distanceUnit)}
                <span className="text-sm text-muted-foreground ml-1">{getDistanceLabel(settings.distanceUnit)}</span>
              </p>
            </div>
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Time</p>
              <p className="font-mono text-2xl landscape:text-xl md:text-4xl font-bold truncate">{formatDuration(rideState.duration)}</p>
            </div>
            <div className="text-center min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max</p>
              <p className="font-mono text-2xl landscape:text-xl md:text-4xl font-bold truncate">
                {formatSpeed(rideState.maxSpeed, settings.speedUnit)}
                <span className="text-sm text-muted-foreground ml-1">{getSpeedLabel(settings.speedUnit)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Controls - row in portrait, column in landscape */}
        <div className="flex landscape:flex-col items-center justify-center gap-3 landscape:gap-2 px-2">
          {/* Pause/Resume button (individual - all riders) - circular icon-only */}
          <button
            onClick={() => {
              const nextPaused = !rideState.isPaused;
              setRidePaused(nextPaused);
              toast.info(nextPaused ? 'Ride paused' : 'Ride resumed');
            }}
            className={cn(
              "h-12 w-12 landscape:h-10 landscape:w-10 rounded-full flex items-center justify-center transition-all touch-target",
              rideState.isPaused
                ? "bg-accent/20 text-accent"
                : "bg-secondary hover:bg-muted text-muted-foreground"
            )}
            title={rideState.isPaused ? "Resume ride" : "Pause ride"}
          >
            {rideState.isPaused ? (
              <Play className="w-6 h-6 landscape:w-5 landscape:h-5" />
            ) : (
              <Pause className="w-6 h-6 landscape:w-5 landscape:h-5" />
            )}
          </button>

          {/* Rescue button (non-leaders only) - circular icon-only */}
          {rideState.isConvoyMode && !convoy.isLeader && (
            <button
              onClick={hasPendingRescue ? cancelRescueRequest : handleRescue}
              className={cn(
                "h-12 w-12 landscape:h-10 landscape:w-10 rounded-full flex items-center justify-center transition-all touch-target",
                hasPendingRescue 
                  ? "bg-warning/20 text-warning animate-pulse" 
                  : "bg-secondary hover:bg-warning/20 text-warning"
              )}
              title={hasPendingRescue ? "Cancel rescue request" : "Request rescue"}
            >
              <AlertTriangle className="w-6 h-6 landscape:w-5 landscape:h-5" />
            </button>
          )}

          {/* Navigation button */}
          <Button
            variant="ghost"
            onClick={() => openNavigation()}
            className="h-12 w-12 landscape:h-10 landscape:w-10 rounded-full bg-secondary hover:bg-muted touch-target"
          >
            <Navigation className="w-6 h-6 landscape:w-5 landscape:h-5" />
          </Button>

          {/* Voice Controls (Convoy Mode) */}
          {rideState.isConvoyMode && (
            <div className="flex items-center gap-2">
              {/* Voice disconnect/connect button */}
              <button
                onClick={async () => {
                  try {
                    // CRITICAL: Unlock iOS audio immediately on user gesture (fire-and-forget, never blocks)
                    unlockIOSAudio();

                    if (isConnected) {
                      disconnect();
                      toast.success('Left voice channel', { description: 'Saving battery' });
                    } else {
                      const result = await connect();
                      if (result.success) {
                        toast.success('Joined voice channel', { description: 'Tap mic to unmute' });
                      } else {
                        toast.error('Failed to join voice channel', { description: result.error || 'Check microphone permissions' });
                      }
                    }
                  } catch (e) {
                    console.error('[Voice] Button error', e);
                    toast.error('Voice action failed');
                  }
                }}
                className={cn(
                  "w-10 h-10 landscape:w-9 landscape:h-9 rounded-full flex items-center justify-center transition-all touch-target",
                  isConnected
                    ? "bg-destructive/20 hover:bg-destructive/30 text-destructive"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                )}
                title={isConnected ? "Leave voice channel (saves battery)" : "Join voice channel"}
              >
                {isConnected ? (
                  <PhoneOff className="w-4 h-4" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
              </button>

              {/* Mute toggle button - only show when connected */}
              {isConnected && (
                <button
                  onClick={() => {
                    // User gesture - try to unlock audio on iOS
                    const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQsMR6LR1cloBA8KZaLe0sdaAAsHWZ/hzq9MAAAIA1if4M6vTAAACQNPkt3Jp0kA');
                    silentAudio.volume = 0.01;
                    silentAudio.play().catch(() => {});
                    toggleMute();
                  }}
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
            </div>
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
                  const colorStyles = getMemberStyles(member);
                  const isSpeaking = speakingUsers.has(member.userId);
                  
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 p-1.5 rounded-lg border transition-all",
                        isSpeaking ? "ring-1 border-transparent" : "border-border/50"
                      )}
                      style={{
                        backgroundColor: colorStyles.bg,
                        ...(isSpeaking ? { '--tw-ring-color': colorStyles.ring } as React.CSSProperties : {})
                      }}
                    >
                      {/* Avatar with speaking glow */}
                      <div 
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                          isSpeaking && "scale-105"
                        )}
                        style={{
                          backgroundColor: colorStyles.bg,
                          boxShadow: isSpeaking ? colorStyles.glow : undefined
                        }}
                      >
                        {member.isLeader ? (
                          <Crown className="w-3.5 h-3.5" style={{ color: colorStyles.text }} />
                        ) : (
                          <User className="w-3.5 h-3.5" style={{ color: colorStyles.text }} />
                        )}
                      </div>
                      
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate" style={{ color: colorStyles.text }}>
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
                          <p className="font-mono text-xs font-bold" style={{ color: colorStyles.text }}>
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
              END RIDE
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
