import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { useWaypoints } from '@/hooks/useWaypoints';
import { useNavigation } from '@/hooks/useNavigation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Copy, Check, LogOut, Mic, MicOff, Crown, User, Navigation, ArrowRightLeft, Play, MapPin, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DestinationSearch } from '@/components/DestinationSearch';
import { WaypointList } from '@/components/WaypointList';
import { getMemberColorStyles } from '@/lib/memberColors';
import { ConvoyDestination } from '@/types/convoy';

export default function Lobby() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy, setDestination, clearDestination, markAsNavigated, transferLeadership, allMembersNavigated } = useConvoyState();
  const { startRide } = useActiveRide(convoy.id);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id);
  const { waypoints, addWaypoint, removeWaypoint, completeWaypoint, reorderWaypoints, nextWaypoint, completedCount, totalCount } = useWaypoints(convoy.id, convoy.isLeader);
  const { openNavigation } = useNavigation();
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLeaderSelect, setShowLeaderSelect] = useState(false); // For leader leaving with other members
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [showAddWaypoint, setShowAddWaypoint] = useState(false);
  const hasStartedRide = useRef(false);
  const prevReadyToStart = useRef<boolean | null>(null);
  const controlChannelRef = useRef<any>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  // Reset ride started flag ONLY when destination is cleared (new ride cycle)
  useEffect(() => {
    if (!convoy.destination) {
      hasStartedRide.current = false;
    }
  }, [convoy.destination]);

  // Cleanup voice channel when leaving lobby (no auto-connect - users must explicitly join)
  useEffect(() => {
    if (!convoy.id) return;
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [convoy.id, isConnected, disconnect]);

  // Convoy control channel (e.g., leader start-for-all)
  useEffect(() => {
    if (!convoy.id) return;

    const channel = supabase.channel(`convoy-control:${convoy.id}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'start-ride' }, () => {
      if (hasStartedRide.current) return;
      hasStartedRide.current = true;
      console.log('[Lobby] Received start-ride broadcast');
      toast.success('Leader started the ride');
      const success = startRide(true, convoy.id);
      if (success) {
        navigate('/ride');
      }
    });

    // Listen for leadership change broadcast
    channel.on('broadcast', { event: 'leadership-changed' }, (payload: any) => {
      console.log('[Lobby] Leadership changed:', payload);
      // The realtime subscription will update the state, but show a toast
      toast.info('Leadership has been transferred');
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Lobby] Subscribed to convoy control channel');
      }
    });

    controlChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      controlChannelRef.current = null;
    };
  }, [convoy.id, navigate, startRide]);

  // Redirect if not in a convoy
  useEffect(() => {
    if (!convoy.isActive) {
      navigate('/');
    }
  }, [convoy.isActive, navigate]);

  // Auto-start ride when the "ready to start" state flips from false -> true
  useEffect(() => {
    const readyToStart = Boolean(convoy.destination) && allMembersNavigated;

    console.log('[Lobby] Checking auto-start:', {
      allMembersNavigated,
      hasDestination: !!convoy.destination,
      readyToStart,
      prevReadyToStart: prevReadyToStart.current,
      hasStarted: hasStartedRide.current,
      members: convoy.members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated }))
    });

    // Don't auto-start from the initial lobby render; only when state changes to ready.
    if (prevReadyToStart.current === null) {
      prevReadyToStart.current = readyToStart;
      return;
    }

    // Only start on the rising edge (prevents immediate re-trigger when returning to lobby)
    if (readyToStart && !prevReadyToStart.current && !hasStartedRide.current) {
      hasStartedRide.current = true;
      console.log('[Lobby] All riders ready, starting ride!');
      toast.success('All riders ready - starting ride!');
      const success = startRide(true, convoy.id);
      if (success) {
        navigate('/ride');
      }
    }

    prevReadyToStart.current = readyToStart;
  }, [allMembersNavigated, convoy.destination, convoy.members, startRide, navigate, convoy.id]);

  const handleCopyCode = async () => {
    if (!convoy.code) return;
    try {
      await navigator.clipboard.writeText(convoy.code);
      setCopied(true);
      toast.success('Code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleLeave = async () => {
    // If leader with other members, handle leadership transfer
    if (convoy.isLeader && convoy.members.length > 1) {
      // If exactly 2 members, auto-transfer to the other member
      if (convoy.members.length === 2) {
        const otherMember = convoy.members.find(m => !m.isLeader);
        if (otherMember) {
          await handleTransferAndLeave(otherMember.userId);
          return;
        }
      }
      // More than 2 members - show selection UI
      setShowLeaderSelect(true);
      setShowLeaveConfirm(false);
      return;
    }
    
    if (isConnected) {
      disconnect();
    }
    await leaveConvoy();
    navigate('/');
  };

  // Transfer leadership and then leave
  const handleTransferAndLeave = async (newLeaderUserId: string) => {
    const success = await transferLeadership(newLeaderUserId);
    if (success) {
      setShowLeaderSelect(false);
      if (isConnected) {
        disconnect();
      }
      // Pass true to skip deactivation since we just transferred leadership
      await leaveConvoy(true);
      navigate('/');
    }
  };

  const handleTransferLeadership = async (userId: string) => {
    const success = await transferLeadership(userId);
    if (success) {
      setTransferTarget(null);
    }
  };

  // Sort members: leader first, then by join time
  const sortedMembers = [...convoy.members].sort((a, b) => {
    if (a.isLeader) return -1;
    if (b.isLeader) return 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  // Get color styles for a member based on their accent color
  const getMemberStyles = (member: typeof sortedMembers[0]) => {
    return getMemberColorStyles(member.accentColor);
  };

  if (!convoy.isActive) return null;

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-3 safe-top safe-bottom md:p-4 lg:p-6">
      {/* Header with Code - compact */}
      <header className="mb-2 landscape:mb-1 md:mb-3 animate-fade-in flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5 landscape:hidden">Convoy Code</p>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 bg-card border border-border rounded-lg px-2 py-1 hover:bg-muted transition-colors"
          >
            <span className="font-mono text-lg landscape:text-base md:text-xl font-bold tracking-widest">{convoy.code}</span>
            {copied ? (
              <Check className="w-4 h-4 text-accent" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        
        {/* Voice Toggle */}
        <button
          onClick={async () => {
            try {
              if (!isConnected) {
                const result = await connect();
                if (!result.success) {
                  toast.error('Failed to join voice', { description: result.error || 'Check microphone permission' });
                  return;
                }
                toast.success('Joined voice channel');
              }
              toggleMute();
            } catch (e) {
              console.error('[Lobby] Voice toggle error', e);
              toast.error('Voice action failed');
            }
          }}
          className={cn(
            "w-10 h-10 landscape:w-9 landscape:h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all touch-target",
            !isMuted
              ? "bg-ptt-active shadow-glow"
              : "bg-ptt-inactive hover:bg-muted"
          )}
        >
          {isMuted ? (
            <MicOff className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
          ) : (
            <Mic className="w-4 h-4 md:w-5 md:h-5 text-background" />
          )}
        </button>
      </header>

      {/* Main content - vertical in portrait, horizontal in landscape */}
      <div className="flex-1 flex flex-col landscape:flex-row gap-3 md:gap-4 min-h-0 overflow-hidden">
        {/* Destination & Waypoints */}
        <div className="flex-1 flex flex-col animate-slide-up relative z-50 min-w-0 overflow-hidden">
          {/* Waypoints List */}
          <WaypointList
            waypoints={waypoints}
            isLeader={convoy.isLeader}
            onComplete={completeWaypoint}
            onRemove={removeWaypoint}
            onReorder={reorderWaypoints}
            completedCount={completedCount}
            totalCount={totalCount}
          />

          {/* Add Waypoint / Current Destination */}
          {showAddWaypoint ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Add Stop</p>
                <button
                  onClick={() => setShowAddWaypoint(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <DestinationSearch
                destination={null}
                onSetDestination={async (dest: ConvoyDestination) => {
                  await addWaypoint({
                    name: dest.name,
                    address: dest.address,
                    lat: dest.lat,
                    lng: dest.lng,
                  });
                  setShowAddWaypoint(false);
                }}
                onClearDestination={() => {}}
                onNavigate={() => {}}
                isLeader={convoy.isLeader}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                  {nextWaypoint ? 'Next Stop' : 'Destination'}
                </p>
                {convoy.isLeader && (
                  <button
                    onClick={() => setShowAddWaypoint(true)}
                    className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80"
                  >
                    <Plus className="w-3 h-3" />
                    Add Stop
                  </button>
                )}
              </div>
              
              {nextWaypoint ? (
                <div className="bg-card border border-accent/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{nextWaypoint.name}</p>
                      {nextWaypoint.address && (
                        <p className="text-xs text-muted-foreground truncate">{nextWaypoint.address}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      openNavigation(nextWaypoint.lat, nextWaypoint.lng, nextWaypoint.name);
                      markAsNavigated();
                    }}
                    className="w-full mt-2 h-10 bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Navigate
                  </Button>
                </div>
              ) : (
                <DestinationSearch
                  destination={convoy.destination}
                  onSetDestination={setDestination}
                  onClearDestination={clearDestination}
                  onNavigate={markAsNavigated}
                  isLeader={convoy.isLeader}
                />
              )}
            </div>
          )}
          
          {/* Status message */}
          {(convoy.destination || nextWaypoint) && (
            <div className="mt-2 animate-fade-in">
              <p className="text-xs text-muted-foreground">
                {allMembersNavigated 
                  ? 'All riders ready!'
                  : `Waiting (${convoy.members.filter(m => m.hasNavigated).length}/${convoy.members.length})`
                }
              </p>
            </div>
          )}
        </div>

        {/* Members List */}
        <div className="landscape:w-52 md:landscape:w-60 animate-slide-up delay-100 relative z-0 flex flex-col min-h-0 max-h-[40vh] landscape:max-h-none">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Riders ({convoy.members.length})
            </h2>
          </div>
          
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1">
            {sortedMembers.map((member, index) => {
              const colorStyles = getMemberStyles(member);
              const isTransferring = transferTarget === member.userId;
              const isSpeaking = speakingUsers.has(member.userId);
              
              return (
                <div
                  key={member.id}
                  className={cn(
                    "flex items-center gap-2 bg-card border rounded-lg p-1.5 animate-slide-up transition-all",
                    isSpeaking && "ring-1 ring-offset-1 ring-offset-background"
                  )}
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    borderColor: colorStyles.border,
                    ...(isSpeaking ? { '--tw-ring-color': colorStyles.ring } as React.CSSProperties : {})
                  }}
                >
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
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs truncate" style={{ color: colorStyles.text }}>{member.name}</p>
                  </div>
                  
                  {/* Transfer leadership button */}
                  {convoy.isLeader && !member.isLeader && sortedMembers.length > 1 && !isTransferring && (
                    <button
                      onClick={() => setTransferTarget(member.userId)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}

                  {isTransferring && (
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => handleTransferLeadership(member.userId)}>
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground" onClick={() => setTransferTarget(null)}>
                        ✕
                      </Button>
                    </div>
                  )}
                  
                  {/* Navigation status */}
                  {!isTransferring && (
                    member.hasNavigated ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        <Navigation className="w-2.5 h-2.5" />
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                        Wait
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons - compact */}
      <div className="mt-2 md:mt-3 animate-slide-up delay-300 flex items-center justify-between">
        {/* Leave button / Leader selection */}
        {showLeaderSelect ? (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <p className="text-xs text-muted-foreground">Select new leader before leaving:</p>
            <div className="flex flex-wrap gap-2">
              {convoy.members.filter(m => !m.isLeader).map(member => {
                const colorStyles = getMemberColorStyles(member.accentColor);
                return (
                  <Button
                    key={member.userId}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    style={{ borderColor: colorStyles.border, color: colorStyles.text }}
                    onClick={() => handleTransferAndLeave(member.userId)}
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    {member.name}
                  </Button>
                );
              })}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs text-muted-foreground"
                onClick={() => setShowLeaderSelect(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : !showLeaveConfirm ? (
          <Button
            onClick={() => setShowLeaveConfirm(true)}
            variant="outline"
            size="sm"
            className="h-9 px-4 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Leave
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleLeave}
              size="sm"
              className="h-9 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Confirm
            </Button>
            <Button
              onClick={() => setShowLeaveConfirm(false)}
              variant="ghost"
              size="sm"
              className="h-9"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Start Ride button - tap for individual start, long-press (leader only) for all */}
        {!showLeaveConfirm && (
          <Button
            onClick={() => {
              // If a long-press fired, ignore the subsequent click
              if (didLongPressRef.current) {
                didLongPressRef.current = false;
                return;
              }

              // Individual start - just this rider
              hasStartedRide.current = true;
              const success = startRide(true, convoy.id);
              if (success) {
                navigate('/ride');
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Desktop long-press (right-click) - leader starts for all
              if (!convoy.isLeader) return;

              hasStartedRide.current = true;
              const success = startRide(true, convoy.id);
              if (success) {
                toast.success('Starting ride for all riders');
                controlChannelRef.current?.send({
                  type: 'broadcast',
                  event: 'start-ride',
                  payload: { at: Date.now() },
                });
                navigate('/ride');
              }
            }}
            onTouchStart={() => {
              didLongPressRef.current = false;

              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
              }

              longPressTimerRef.current = window.setTimeout(() => {
                if (!convoy.isLeader) return;

                didLongPressRef.current = true;
                hasStartedRide.current = true;

                const success = startRide(true, convoy.id);
                if (success) {
                  toast.success('Starting ride for all riders');
                  controlChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'start-ride',
                    payload: { at: Date.now() },
                  });
                  navigate('/ride');
                }
              }, 500);
            }}
            onTouchEnd={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onTouchMove={() => {
              // Cancel long press if finger moves
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            size="sm"
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            title={convoy.isLeader ? 'Tap to start your ride, hold to start for all' : 'Start your ride'}
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Start Ride
          </Button>
        )}
      </div>
    </div>
  );
}
