import { Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceControlProps {
  isSpeaking: boolean;
  onToggle: () => void;
  memberCount: number;
}

export function VoiceControl({ isSpeaking, onToggle, memberCount }: VoiceControlProps) {
  return (
    <div className="glass rounded-2xl p-6 animate-slide-up delay-200">
      <div className="flex flex-col items-center">
        <h2 className="font-display text-sm font-semibold text-muted-foreground mb-4 tracking-wider uppercase">
          Voice Channel
        </h2>
        
        <div className="relative mb-4">
          {/* Ripple effect when speaking */}
          {isSpeaking && (
            <>
              <div className="absolute inset-0 rounded-full bg-accent/20 animate-ripple" />
              <div className="absolute inset-0 rounded-full bg-accent/20 animate-ripple delay-300" />
            </>
          )}
          
          <Button
            variant={isSpeaking ? "voice" : "voiceInactive"}
            size="iconXl"
            onClick={onToggle}
            className={cn(
              "relative z-10 transition-all duration-300",
              isSpeaking && "animate-voice-pulse"
            )}
          >
            {isSpeaking ? (
              <Mic className="w-8 h-8" />
            ) : (
              <MicOff className="w-8 h-8" />
            )}
          </Button>
        </div>

        <p className={cn(
          "text-sm font-medium transition-colors duration-300",
          isSpeaking ? "text-accent" : "text-muted-foreground"
        )}>
          {isSpeaking ? "Broadcasting..." : "Push to Talk"}
        </p>

        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <Volume2 className="w-3.5 h-3.5" />
          <span>{memberCount} listeners</span>
        </div>
      </div>
    </div>
  );
}
