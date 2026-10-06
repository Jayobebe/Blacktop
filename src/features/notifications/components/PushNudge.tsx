import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { isDemoModeActive } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { enablePush, getPushState, usePush } from '../lib/push';
import { closePushNudge, usePushNudge } from '../lib/pushNudge';

/**
 * The one time Blacktop asks for notifications without being asked to: a card
 * saying what they're for, then (on Turn on) the phone's own prompt. Shown
 * only where a prompt can still be answered: not when notifications are
 * already on, already refused, or can't work on this phone.
 */
export function PushNudge() {
  const reason = usePushNudge();
  const push = usePush();
  const [busy, setBusy] = useState(false);

  const askable = push.support === 'supported' && push.permission === 'default' && !push.enabled && !isDemoModeActive();
  useEffect(() => {
    // Nothing to ask here. On, or refused, is settled for good; a phone that can't yet (not installed) may be able to later.
    if (reason && !askable) closePushNudge(push.enabled || push.permission === 'denied');
  }, [reason, askable, push.enabled, push.permission]);

  if (!reason || !askable) return null;

  const turnOn = async () => {
    setBusy(true);
    const ok = await enablePush();
    setBusy(false);
    const { permission, error } = getPushState();
    if (ok) toast.success(tr("Notifications are on"));
    else if (permission === 'granted' && error) toast(error, { description: tr("Blacktop will finish setting them up next time you open it.") });
    closePushNudge();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && closePushNudge()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-accent" aria-hidden />
            {tr("Hear about it when it matters")}
          </DialogTitle>
          <DialogDescription>
            {reason === 'rescue'
              ? tr("Turn on notifications and Blacktop can alert this phone when someone you ride with calls for rescue, even with the app closed. You choose which alerts you get in Settings.")
              : tr("Turn on notifications and Blacktop can alert this phone when someone in your crew or convoy calls for rescue, even with the app closed. You choose which alerts you get in Settings.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:space-x-0">
          <Button variant="outline" className="h-12 flex-1" disabled={busy} onClick={() => closePushNudge()}>
            {tr("Not now")}
          </Button>
          <Button className="h-12 flex-1 font-semibold" disabled={busy} onClick={() => void turnOn()}>
            {tr("Turn on")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
