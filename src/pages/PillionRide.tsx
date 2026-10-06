import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Headphones, LogOut, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { useConvoyState, getConvoySnapshot } from '@/features/convoy';
import { useProfile } from '@/features/profile';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';
import { AudioDeviceSelector } from '@/features/voice/components/AudioDeviceSelector';
import { useRescue, RescueAlert } from '@/features/rescue';
import { useConvoyMergeSync, useProximityState } from '@/features/proximity';
import { useRideRole, setPillionRiding, clearRideRole, useReactionsListener, sendReaction, REACTIONS, WAVE } from '@/features/pillion';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * Passenger screen for a convoy ride: voice, Wave / emoji reactions and
 * rescue — no map, no stats, no ride recording (the operator's phone does
 * all of that for the bike).
 */
export default function PillionRide() {
  const navigate = useNavigate();
  const { convoy, leaveConvoy, joinConvoy } = useConvoyState();
  const { user, profile } = useProfile();
  const role = useRideRole();
  const proximity = useProximityState();
  const userId = user?.id ?? null;
  const name = profile.name || 'Pillion';

  const { isConnected, isMuted, speakingUsers, connect, disconnect, toggleMute } = useVoiceChannel(convoy.id ?? undefined);
  const { rescueRequests, hasPendingRescue, sendRescueRequest, dismissRescue, cancelRescueRequest, respondToRescue } = useRescue(
    convoy.id,
    convoy.isLeader,
    userId,
    name,
  );
  useReactionsListener(convoy.id, userId);
  // Follow the convoy through a merge/unmerge like any other member.
  useConvoyMergeSync({
    convoy,
    userId,
    actions: { joinConvoy, leaveConvoy, attachRide: () => {}, getConvoyId: () => getConvoySnapshot().id },
  });

  const wakeLock = useWakeLock();
  useEffect(() => {
    wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useBackgroundAudio(isConnected && convoy.members.length > 1);

  const [showAudio, setShowAudio] = useState(false);
  const [confirmRescue, setConfirmRescue] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Remember we're mid-ride so a reload comes straight back here.
  useEffect(() => {
    if (role.role === 'pillion' && !role.riding) setPillionRiding(true);
  }, [role.role, role.riding]);

  // Ride over: the leader ended it (convoy goes inactive). Ignore the brief
  // gap while moving between convoys in a merge.
  const endedRef = useRef(false);
  useEffect(() => {
    if (convoy.isRestoring || convoy.isActive || proximity.busy) return;
    const t = setTimeout(() => {
      if (endedRef.current || getConvoySnapshot().isActive) return;
      endedRef.current = true;
      disconnect();
      clearRideRole();
      toast.info(tr("Ride over"), { description: tr("Thanks for riding pillion.") });
      navigate('/', { replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [convoy.isActive, convoy.isRestoring, proximity.busy, disconnect, navigate]);

  const handleVoice = async () => {
    unlockIOSAudio();
    if (!isConnected) {
      const res = await connect();
      if (!res.success) {
        toast.error(tr("Could not join voice"), { description: res.error || tr("Check microphone permission") });
        return;
      }
      toast.success(tr("Voice on"), { description: tr("Tap again to unmute") });
      return;
    }
    toggleMute();
  };

  const handleRescue = () => {
    if (hasPendingRescue) {
      void cancelRescueRequest();
      return;
    }
    if (!confirmRescue) {
      setConfirmRescue(true);
      setTimeout(() => setConfirmRescue(false), 4000);
      return;
    }
    setConfirmRescue(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => void sendRescueRequest(pos.coords.latitude, pos.coords.longitude),
      () => toast.error(tr("Unable to get your location")),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  };

  const handleLeave = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      setTimeout(() => setConfirmLeave(false), 4000);
      return;
    }
    endedRef.current = true;
    disconnect();
    await leaveConvoy();
    clearRideRole();
    navigate('/', { replace: true });
  };

  const react = async (emoji: string) => {
    if (!userId) return;
    const sent = await sendReaction(userId, name, emoji);
    if (sent) toast(tr("{0}  Sent", [emoji]), { duration: 1200 });
  };

  const leader = convoy.members.find((m) => m.isLeader);
  const others = convoy.members.filter((m) => m.userId !== userId);

  return (
    <div className="h-dvh max-h-dvh overflow-y-auto flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      <RescueAlert
        requests={rescueRequests}
        isLeader={false}
        onAddWaypoint={() => {}}
        onRespond={respondToRescue}
        onDismiss={dismissRescue}
      />

      <PageHeader
        title={tr("Pillion")}
        subtitle={`${leader ? tr("{0}'s convoy", [leader.name]) : tr("Convoy")} · ${convoy.members.length === 1 ? tr("1 rider") : tr("{0} riders", [convoy.members.length])}`}
        backTo={false}
        right={
          <HeaderButton onClick={() => setShowAudio(true)} aria-label={tr("Audio device")}>
            <Headphones className="w-5 h-5" />
          </HeaderButton>
        }
      />

      {/* Voice */}
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          onClick={handleVoice}
          className={cn(
            'w-28 h-28 rounded-full flex items-center justify-center transition-all touch-target',
            isConnected && !isMuted
              ? 'bg-ptt-active shadow-glow'
              : isConnected
                ? 'bg-accent/20 border-2 border-accent/60'
                : 'bg-card border-2 border-border',
          )}
          aria-label={!isConnected ? tr("Join voice") : isMuted ? tr("Unmute") : tr("Mute")}
        >
          {isConnected && !isMuted ? (
            <Mic className="w-12 h-12 text-background" />
          ) : (
            <MicOff className={cn('w-12 h-12', isConnected ? 'text-accent' : 'text-muted-foreground')} />
          )}
        </button>
        <p className="text-sm text-muted-foreground">
          {!isConnected ? tr("Tap to join voice") : isMuted ? tr("Muted · tap to talk") : tr("Live · tap to mute")}
        </p>
        {others.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
            {others.map((m) => (
              <span
                key={m.userId}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  speakingUsers.has(m.userId) ? 'border-accent bg-accent/20 text-accent' : 'border-border/60 text-muted-foreground',
                )}
              >
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Wave + reactions */}
      <div className="space-y-3">
        <Button onClick={() => react(WAVE)} className="w-full h-14 text-lg font-semibold">
          <span className="text-2xl mr-2">{WAVE}</span>{" "}{tr("Wave")}
        </Button>
        <div className="grid grid-cols-4 gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r.emoji}
              onClick={() => react(r.emoji)}
              className="aspect-square rounded-2xl bg-card border border-border/60 text-3xl flex items-center justify-center hover:bg-secondary active:scale-95 transition-all"
              aria-label={r.label}
              title={r.label}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* Rescue + leave */}
      <div className="space-y-2 pt-4">
        <Button
          onClick={handleRescue}
          variant="outline"
          className={cn(
            'w-full h-14 text-base font-semibold border-2',
            hasPendingRescue
              ? 'border-[hsl(var(--burn))] text-[hsl(var(--burn))] animate-pulse'
              : confirmRescue
                ? 'border-[hsl(var(--burn))] bg-[hsl(var(--burn))] text-white hover:bg-[hsl(var(--burn))] hover:brightness-110'
                : 'border-[hsl(var(--burn)/0.7)] text-[hsl(var(--burn))] hover:bg-[hsl(var(--burn)/0.1)] hover:text-[hsl(var(--burn))]',
          )}
        >
          {/* The same R as the ride screen's rescue button. */}
          <span aria-hidden className={cn('mr-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black leading-none', confirmRescue && !hasPendingRescue ? 'bg-white text-[hsl(var(--burn))]' : 'bg-[hsl(var(--burn))] text-white')}>
            R
          </span>
          {hasPendingRescue ? tr("Rescue sent · tap to cancel") : confirmRescue ? tr("Tap again to alert the convoy") : tr("Request rescue")}
        </Button>
        <Button onClick={handleLeave} variant="ghost" className="w-full h-11 text-muted-foreground">
          <LogOut className="w-4 h-4 mr-2" />
          {confirmLeave ? tr("Tap again to leave the convoy") : tr("Leave convoy")}
        </Button>
      </div>

      {showAudio && (
        <div
          className="fixed inset-0 z-[100] safe-frame flex items-center justify-center bg-background/90 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setShowAudio(false)}
        >
          <div className="bg-card border border-border/50 rounded-2xl p-4 w-full max-w-sm max-h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">{tr("Voice Chat Audio")}</h3>
              </div>
              <button onClick={() => setShowAudio(false)} className="p-1 hover:bg-muted rounded-lg transition-colors" aria-label={tr("Close")}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <AudioDeviceSelector compact />
            <Button onClick={() => setShowAudio(false)} className="w-full mt-4" size="sm">
              {tr("Done")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
