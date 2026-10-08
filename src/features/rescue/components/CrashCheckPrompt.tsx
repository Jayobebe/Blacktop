import { useEffect, useRef, useState } from 'react';
import { warningTone } from '@/lib/radioFx';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface Props {
  /** Seconds on the clock. */
  timeoutSec: number;
  /**
   * The rider pressed the rescue button themselves. Nothing is sent unless
   * they answer No: when the clock runs out the card just closes (the button
   * gets pressed by accident mid-ride). Left out, it's the crash check, which
   * sends when the clock runs out.
   */
  manual?: boolean;
  /** Yes. */
  onImFine: () => void;
  /** No: send the rescue call. */
  onSendNow: () => void;
  /** The clock ran out. */
  onTimeout: () => void;
}

/**
 * "Are you okay?", in the middle of the screen: one glowing burn-orange card
 * with a big Yes and a big No, each big enough for a glove. The same card asks
 * after a possible crash and after the rescue button is pressed; only what an
 * unanswered clock does differs. Yes and No sit side by side in portrait, and
 * beside the question in landscape.
 */
export function CrashCheckPrompt({ timeoutSec, manual, onImFine, onSendNow, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(timeoutSec);
  // The ride screen redraws many times a second: the clock mustn't restart with it.
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  const fired = useRef(false);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, timeoutSec - Math.floor((Date.now() - started) / 1000));
      setRemaining(left);
      if (left === 0 && !fired.current) {
        fired.current = true;
        window.clearInterval(id);
        timeout.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [timeoutSec]);

  // The crash check keeps warbling (the rider may be down); a pressed button says it once.
  useEffect(() => {
    haptics.heavy();
    warningTone('caution');
    if (manual) return;
    const id = window.setInterval(() => {
      warningTone('caution');
      haptics.medium();
    }, 3000);
    return () => window.clearInterval(id);
  }, [manual]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const answer = 'flex flex-col items-center justify-center gap-0.5 rounded-2xl min-h-24 short:min-h-20 px-3 py-3 font-black text-white transition-transform active:scale-95';

  return (
    <div className="fixed inset-0 z-[60] safe-frame flex items-center justify-center p-3 bg-background/90 backdrop-blur-md animate-fade-in" role="alertdialog" aria-modal="true" aria-label={tr("Are you okay?")}>
      <div className="rescue-ask w-full max-w-md short:max-w-3xl max-h-full overflow-y-auto rounded-3xl p-6 short:p-4 text-center short:grid short:grid-cols-2 short:items-center short:gap-5 animate-scale-in">
        <div>
          <div className="mx-auto mb-3 short:mb-2 flex h-16 w-16 short:h-12 short:w-12 items-center justify-center rounded-full bg-[hsl(var(--burn))] text-white">
            <span aria-hidden className="text-3xl short:text-2xl font-black leading-none">R</span>
          </div>
          <h2 className="text-4xl short:text-3xl font-black tracking-tight text-white leading-none">{tr("Are you okay?")}</h2>
          <p className="mt-2 text-sm text-white/75 leading-snug">
            {manual ? tr("You pressed rescue. Nothing is sent unless you answer No.") : tr("Possible crash detected. If you don't respond, a rescue ping will be sent automatically.")}
          </p>
          <div className="mt-4 short:mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-[hsl(var(--burn))] transition-[width] duration-300 ease-linear" style={{ width: `${(remaining / timeoutSec) * 100}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-2xl short:text-xl font-bold text-white tabular-nums leading-none">
            {mins}:{secs.toString().padStart(2, '0')}
          </p>
          <p className="mt-1 mb-5 short:mb-0 text-xs text-white/70">{manual ? tr("This closes by itself when the clock runs out.") : tr("Rescue is sent when the clock runs out.")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onImFine} className={cn(answer, 'bg-emerald-600')}>
            <span className="text-4xl short:text-3xl leading-none">{tr("Yes")}</span>
            <span className="text-xs font-semibold text-white/85">{tr("I'm fine")}</span>
          </button>
          <button type="button" onClick={onSendNow} className={cn(answer, 'bg-[hsl(var(--burn))]')}>
            <span className="text-4xl short:text-3xl leading-none">{tr("No")}</span>
            <span className="text-xs font-semibold text-white/85">{tr("Send rescue")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
