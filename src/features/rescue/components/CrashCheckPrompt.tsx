import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, ShieldCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';

interface Props {
  /** Total seconds before auto-firing rescue. */
  timeoutSec: number;
  onImFine: () => void;
  onSendNow: () => void;
  /** Called automatically when the countdown reaches 0. */
  onTimeout: () => void;
}

/**
 * Full-screen "Are you okay?" prompt shown after possible-crash detection.
 * Counts down; auto-fires rescue if the rider doesn't respond in time.
 */
export function CrashCheckPrompt({ timeoutSec, onImFine, onSendNow, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(timeoutSec);
  const firedRef = useRef(false);
  const chimeRef = useRef<number | null>(null);

  // Countdown
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!firedRef.current) {
            firedRef.current = true;
            onTimeout();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onTimeout]);

  // Repeating haptic + chime while open
  useEffect(() => {
    haptics.heavy();
    const beep = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.15;
        o.connect(g).connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 250);
      } catch { /* noop */ }
      haptics.medium();
    };
    beep();
    chimeRef.current = window.setInterval(beep, 3000);
    return () => {
      if (chimeRef.current) window.clearInterval(chimeRef.current);
    };
  }, []);

  const pct = remaining / timeoutSec;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 backdrop-blur-md animate-fade-in">
      <div className="w-[92vw] max-w-md bg-card border-2 border-destructive/60 rounded-3xl p-6 shadow-2xl animate-scale-in text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center animate-pulse mb-4">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-1">Are you okay?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Possible crash detected. If you don't respond, a rescue ping will be sent automatically.
        </p>

        {/* Countdown bar */}
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-destructive transition-all duration-1000 ease-linear"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <p className="font-mono text-3xl font-bold text-destructive tabular-nums mb-6">
          {mins}:{secs.toString().padStart(2, '0')}
        </p>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            onClick={onImFine}
            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-2"
          >
            <ShieldCheck className="w-5 h-5" />
            I'm fine
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onSendNow}
            className="w-full h-12 border-destructive/60 text-destructive hover:bg-destructive/10 gap-2"
          >
            <Send className="w-4 h-4" />
            Send rescue now
          </Button>
        </div>
      </div>
    </div>
  );
}
