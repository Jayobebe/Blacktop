import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { Button } from '@/components/ui/button';
import { Copy, Check, LogOut, Mic, MicOff, Crown, User, Navigation, ArrowRightLeft, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DestinationSearch } from '@/components/DestinationSearch';
import { getMemberColorStyles } from '@/lib/memberColors';

export default function Lobby() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy, setDestination, clearDestination, markAsNavigated, transferLeadership, allMembersNavigated } = useConvoyState();
  const { startRide } = useActiveRide(convoy.id);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const hasStartedRide = useRef(false);
  const prevReadyToStart = useRef<boolean | null>(null);

  // Reset ride started flag ONLY when destination is cleared (new ride cycle)
  useEffect(() => {
    if (!convoy.destination) {
      hasStartedRide.current = false;
    }
  }, [convoy.destination]);

  // Connect to voice channel when entering lobby with valid convoy
  useEffect(() => {
    if (!isConnected && convoy.id) {
      connect();
    }
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [convoy.id]);

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
    if (isConnected) {
      disconnect();
    }
    await leaveConvoy();
    navigate('/');
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
          onClick={toggleMute}
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
        {/* Destination */}
        <div className="flex-1 flex flex-col animate-slide-up relative z-50 min-w-0">
          <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">Destination</p>
          <DestinationSearch
            destination={convoy.destination}
            onSetDestination={setDestination}
            onClearDestination={clearDestination}
            onNavigate={markAsNavigated}
            isLeader={convoy.isLeader}
          />
          
          {/* Status message */}
          {convoy.destination && (
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
        {/* Leave button */}
        {!showLeaveConfirm ? (
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

        {/* Start Ride button - always visible */}
        {!showLeaveConfirm && (
          <Button
            onClick={() => {
              hasStartedRide.current = true;
              const success = startRide(true, convoy.id);
              if (success) {
                navigate('/ride');
              }
            }}
            size="sm"
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Start Ride
          </Button>
        )}
      </div>
    </div>
  );
}
