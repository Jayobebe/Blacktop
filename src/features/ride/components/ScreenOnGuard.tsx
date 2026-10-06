import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/platform';
import { tr } from '@/lib/i18n';

const SEEN_KEY = 'blacktop_screen_on_tip';
/** A stretch shorter than this without a fix isn't worth a notice. */
const GAP_MS = 60_000;

/**
 * On the web a ride only records while Blacktop is on screen: a phone stops
 * giving a web page its location once it's locked or in the background. This
 * says so once, before the first ride, and when the app comes back mid-ride
 * says how long went unrecorded (only if fixes really stopped: the gap is
 * measured from the last one). The native apps keep GPS in the background, so
 * there it renders nothing. Mounted on the ride screen.
 */
export function ScreenOnGuard({ active, paused, lastFix }: { active: boolean; paused: boolean; lastFix: number | null }) {
  const web = !isNativeApp();
  const [tip, setTip] = useState(false);
  const live = useRef({ active, paused, lastFix });
  live.current = { active, paused, lastFix };

  useEffect(() => {
    if (!web || !active) return;
    try {
      if (!localStorage.getItem(SEEN_KEY)) setTip(true);
    } catch {
      // No storage: skip the tip rather than show it every ride.
    }
  }, [web, active]);

  useEffect(() => {
    if (!web) return;
    let hiddenAt: number | null = null;
    const onChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        hiddenAt = live.current.active && !live.current.paused ? now : null;
        return;
      }
      const went = hiddenAt;
      hiddenAt = null;
      const { active: riding, paused: held, lastFix: fix } = live.current;
      if (went === null || !riding || held || fix === null) return;
      // From when fixes stopped, not from when the app was hidden: some phones keep them coming for a while.
      const lost = now - Math.max(went, fix);
      if (lost < GAP_MS) return;
      const minutes = Math.round(lost / 60_000);
      toast.warning(minutes === 1 ? tr("Blacktop was off screen for 1 minute. That stretch wasn't recorded.") : tr("Blacktop was off screen for {0} minutes. That stretch wasn't recorded.", [minutes]), {
        description: tr("Keep Blacktop on screen while you ride."),
        duration: 15_000,
      });
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [web]);

  if (!web) return null;
  const done = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Shown again next ride, which is no harm.
    }
    setTip(false);
  };

  return (
    <Dialog open={tip} onOpenChange={(open) => !open && done()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-accent" aria-hidden />
            {tr("Keep Blacktop on screen")}
          </DialogTitle>
          <DialogDescription>
            {tr("Your phone stops sharing its location with a web app once it's locked or in the background, so that part of a ride isn't recorded. Blacktop keeps the screen awake for you: don't lock it or switch apps, and plug in on long rides.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="h-12 w-full font-semibold" onClick={done}>
            {tr("Got it")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
