import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rescueDisclaimer } from '../lib/rescueConsent';

/** The standing rescue / crash detection disclaimer (Settings → Safety, onboarding, the consent dialog). */
export function RescueDisclaimer({ className }: { className?: string }) {
  return (
    <div role="note" className={cn('flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3', className)}>
      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden />
      <p className="text-[11px] leading-snug text-foreground/90">{rescueDisclaimer()}</p>
    </div>
  );
}
