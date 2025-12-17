import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { Button } from '@/components/ui/button';
import { Copy, Check, LogOut, Mic, MicOff, Crown, User, Navigation, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DestinationSearch } from '@/components/DestinationSearch';

// Unique colors for convoy members
const MEMBER_COLORS = [
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
];

export default function Lobby() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy, setDestination, clearDestination, markAsNavigated, transferLeadership, allMembersNavigated } = useConvoyState();
  const { startRide } = useActiveRide(convoy.id);
  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const hasStartedRide = useRef(false);

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

  // Auto-start ride when all members have navigated
  useEffect(() => {
    console.log('[Lobby] Checking auto-start:', {
      allMembersNavigated,
      hasDestination: !!convoy.destination,
      hasStarted: hasStartedRide.current,
      members: convoy.members.map(m => ({ name: m.name, hasNavigated: m.hasNavigated }))
    });

    if (allMembersNavigated && convoy.destination && !hasStartedRide.current) {
      hasStartedRide.current = true;
      console.log('[Lobby] All riders ready, starting ride!');
      toast.success('All riders ready - starting ride!');
      const success = startRide(true, convoy.id);
      if (success) {
        navigate('/ride');
      }
    }
  }, [allMembersNavigated, convoy.destination, convoy.members, startRide, navigate]);

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

  // Assign consistent colors based on join order (excluding leader who gets accent color)
  const getMemberColor = (index: number, isLeader: boolean) => {
    if (isLeader) return { bg: 'bg-accent/20', text: 'text-accent', border: 'border-accent/30' };
    // Non-leaders get colors from the array (index - 1 since leader is always index 0)
    return MEMBER_COLORS[(index - 1) % MEMBER_COLORS.length];
  };

  if (!convoy.isActive) return null;

  return (
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom landscape-compact md:p-6 lg:p-8">
      {/* Header with Code - compact on landscape */}
      <header className="mb-3 md:mb-4 animate-fade-in flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Convoy Code</p>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 md:px-4 md:py-2 hover:bg-muted transition-colors"
          >
            <span className="font-mono text-xl md:text-2xl font-bold tracking-widest">{convoy.code}</span>
            {copied ? (
              <Check className="w-4 h-4 md:w-5 md:h-5 text-accent" />
            ) : (
              <Copy className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
            )}
          </button>
        </div>
        
        {/* Voice Toggle - moved to header on wider screens */}
        <button
          onClick={toggleMute}
          className={cn(
            "w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all touch-target",
            !isMuted
              ? "bg-ptt-active shadow-glow"
              : "bg-ptt-inactive hover:bg-muted"
          )}
        >
          {isMuted ? (
            <MicOff className="w-5 h-5 md:w-6 md:h-6 text-foreground" />
          ) : (
            <Mic className="w-5 h-5 md:w-6 md:h-6 text-background" />
          )}
        </button>
      </header>

      {/* Main content - horizontal layout on wider screens */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Left side - Destination */}
        <div className="md:flex-1 md:max-w-md animate-slide-up relative z-50">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Destination</p>
          <DestinationSearch
            destination={convoy.destination}
            onSetDestination={setDestination}
            onClearDestination={clearDestination}
            onNavigate={markAsNavigated}
            isLeader={convoy.isLeader}
          />
          
          {/* Status message */}
          {convoy.destination && (
            <div className="mt-3 text-center md:text-left animate-fade-in">
              <p className="text-sm text-muted-foreground">
                {allMembersNavigated 
                  ? 'All riders ready - starting ride...'
                  : `Waiting for riders (${convoy.members.filter(m => m.hasNavigated).length}/${convoy.members.length})`
                }
              </p>
            </div>
          )}
        </div>

        {/* Right side - Members List */}
        <div className="flex-1 animate-slide-up delay-100 relative z-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Riders ({convoy.members.length})
            </h2>
          </div>
          
          <div className="space-y-2 md:max-h-[300px] md:overflow-y-auto md:pr-2">
            {sortedMembers.map((member, index) => {
              const color = getMemberColor(index, member.isLeader);
              const isTransferring = transferTarget === member.userId;
              const isSpeaking = speakingUsers.has(member.userId);
              
              return (
                <div
                  key={member.id}
                  className={cn(
                    "flex items-center gap-3 bg-card border rounded-lg p-2.5 md:p-3 animate-slide-up transition-all",
                    color.border,
                    isSpeaking && "ring-2 ring-accent ring-offset-2 ring-offset-background"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={cn(
                    "w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                    color.bg,
                    isSpeaking && "shadow-[0_0_12px_4px] shadow-accent/60 scale-110"
                  )}>
                    {member.isLeader ? (
                      <Crown className={cn("w-4 h-4", color.text)} />
                    ) : (
                      <User className={cn("w-4 h-4", color.text)} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium text-sm truncate", color.text)}>{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.isLeader ? 'Leader' : 'Rider'}
                    </p>
                  </div>
                  
                  {/* Transfer leadership button (for leader viewing non-leaders) */}
                  {convoy.isLeader && !member.isLeader && sortedMembers.length > 1 && (
                    <>
                      {isTransferring ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleTransferLeadership(member.userId)}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setTransferTarget(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setTransferTarget(member.userId)}
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="Transfer leadership"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                  
                  {/* Navigation status */}
                  {!isTransferring && (
                    member.hasNavigated ? (
                      <span className="flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-1 rounded flex-shrink-0">
                        <Navigation className="w-3 h-3" />
                        Ready
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
                        Waiting
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons - horizontal on wider screens */}
      <div className="mt-4 md:mt-6 animate-slide-up delay-300">
        {!showLeaveConfirm ? (
          <Button
            onClick={() => setShowLeaveConfirm(true)}
            variant="outline"
            className="w-full md:w-auto md:min-w-[200px] h-11 md:h-12 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Leave Convoy
          </Button>
        ) : (
          <div className="flex flex-col md:flex-row gap-2 md:gap-3">
            <Button
              onClick={handleLeave}
              className="h-11 md:h-12 md:min-w-[180px] bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              Confirm Leave
            </Button>
            <Button
              onClick={() => setShowLeaveConfirm(false)}
              variant="ghost"
              className="h-10 md:h-12 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
