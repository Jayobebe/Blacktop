import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { useActiveRide } from '@/hooks/useActiveRide';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';
import { Button } from '@/components/ui/button';
import { Copy, Check, LogOut, Play, Mic, MicOff, Crown, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Lobby() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy } = useConvoyState();
  const { startRide } = useActiveRide();
  const { isConnected, isMuted, connect, disconnect, toggleMute } = useVoiceChannel();
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Connect to voice channel when entering lobby
  useEffect(() => {
    if (!isConnected) {
      connect();
    }
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, []);

  // Redirect if not in a convoy
  useEffect(() => {
    if (!convoy.isActive) {
      navigate('/');
    }
  }, [convoy.isActive, navigate]);

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

  const handleStartRide = () => {
    const success = startRide(true);
    if (success) {
      navigate('/ride');
    }
  };

  const handleLeave = () => {
    if (isConnected) {
      disconnect();
    }
    leaveConvoy();
    navigate('/');
  };

  if (!convoy.isActive) return null;

  return (
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header with Code */}
      <header className="mb-6 animate-fade-in">
        <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Convoy Code</p>
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 hover:bg-muted transition-colors"
        >
          <span className="font-mono text-2xl font-bold tracking-widest">{convoy.code}</span>
          {copied ? (
            <Check className="w-5 h-5 text-accent" />
          ) : (
            <Copy className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
      </header>

      {/* Members List */}
      <div className="flex-1 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Riders ({convoy.members.length})
          </h2>
        </div>
        
        <div className="space-y-2">
          {convoy.members.map((member, index) => (
            <div
              key={member.id}
              className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                member.isLeader ? "bg-accent/20" : "bg-secondary"
              )}>
                {member.isLeader ? (
                  <Crown className="w-5 h-5 text-accent" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.isLeader ? 'Leader' : 'Rider'}
                </p>
              </div>
              {member.isReady && (
                <span className="text-xs text-accent bg-accent/10 px-2 py-1 rounded">
                  Ready
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Voice Toggle */}
      <div className="flex justify-center mb-6 animate-slide-up delay-100">
        <button
          onClick={toggleMute}
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center transition-all touch-target",
            !isMuted
              ? "bg-ptt-active shadow-glow"
              : "bg-ptt-inactive hover:bg-muted"
          )}
        >
          {isMuted ? (
            <MicOff className="w-7 h-7 text-foreground" />
          ) : (
            <Mic className="w-7 h-7 text-background" />
          )}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 animate-slide-up delay-200">
        {convoy.isLeader && (
          <Button
            onClick={handleStartRide}
            className="w-full h-14 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground touch-target"
          >
            <Play className="w-5 h-5 mr-2" />
            START RIDE
          </Button>
        )}

        {!showLeaveConfirm ? (
          <Button
            onClick={() => setShowLeaveConfirm(true)}
            variant="outline"
            className="w-full h-12 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground touch-target"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Leave Convoy
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={handleLeave}
              className="w-full h-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground touch-target"
            >
              Confirm Leave
            </Button>
            <Button
              onClick={() => setShowLeaveConfirm(false)}
              variant="ghost"
              className="w-full h-10 touch-target"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
