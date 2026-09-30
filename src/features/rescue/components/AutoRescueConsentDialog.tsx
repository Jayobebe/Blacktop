import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useSettings } from '@/features/settings';
import { tr } from '@/lib/i18n';
import { requestAutoRescueConsent, useRescueConsentRequest } from '../lib/rescueConsent';
import { RescueDisclaimer } from './RescueDisclaimer';

/**
 * Mounted once in App.tsx. Shows when anything asks requestAutoRescueConsent():
 * "Turn on" stays disabled until the rider ticks that they understand. Also
 * asks once, on launch, anyone who already had crash detection on without
 * having accepted it; declining turns it off.
 */
export function AutoRescueConsentDialog() {
  const { open, answer } = useRescueConsentRequest();
  const { settings, updateSettings } = useSettings();
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  // Riders who turned it on before the disclaimer existed.
  const needsAck = settings.autoRescueEnabled && !settings.autoRescueAcknowledgedAt;
  useEffect(() => {
    if (!needsAck) return;
    void requestAutoRescueConsent().then((ok) => {
      updateSettings(ok ? { autoRescueAcknowledgedAt: Date.now() } : { autoRescueEnabled: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAck]);

  const accept = () => {
    updateSettings({ autoRescueAcknowledgedAt: Date.now() });
    answer(true);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && answer(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Before you turn on crash detection")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <RescueDisclaimer />
              <p className="text-xs text-muted-foreground">
                {tr("It asks if you're okay after a hard impact and a stop, and alerts the people you chose in Settings → Safety if you don't answer. Always call the emergency services yourself when you can.")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border/60 p-3 min-h-[48px]">
          <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" />
          <span className="text-xs leading-relaxed">{tr("I understand Blacktop is not an emergency service and can't guarantee an alert is delivered.")}</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-[48px]">{tr("Cancel")}</AlertDialogCancel>
          <Button className="min-h-[48px]" disabled={!understood} onClick={accept}>
            {tr("Turn on crash detection")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
