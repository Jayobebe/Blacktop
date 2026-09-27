import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVoiceChannel, unlockIOSAudio } from '@/features/voice';

/** Rider ⇄ pit crew voice, on a voice channel keyed by the pairing link. */
export function TrackVoice({ linkToken, className }: { linkToken: string | null; className?: string }) {
  const { isConnected, isMuted, connect, toggleMute } = useVoiceChannel(linkToken ? `track-${linkToken}` : undefined);
  if (!linkToken) return null;
  return (
    <button
      onClick={async () => {
        unlockIOSAudio();
        if (!isConnected) {
          const r = await connect();
          if (!r.success) toast.error('Could not join voice', { description: r.error || 'Check microphone permission' });
          else toast.success('Voice on', { description: 'Tap again to unmute' });
          return;
        }
        toggleMute();
      }}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-lg border text-xs',
        isConnected && !isMuted ? 'bg-accent text-accent-foreground border-accent' : isConnected ? 'border-accent/60 text-accent' : 'border-border text-muted-foreground',
        className,
      )}
      aria-label={!isConnected ? 'Join voice with crew' : isMuted ? 'Unmute' : 'Mute'}
    >
      {isConnected && !isMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
      {!isConnected ? 'Voice' : isMuted ? 'Muted' : 'Live'}
    </button>
  );
}
