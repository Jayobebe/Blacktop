import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/profile';
import { holdTips } from '@/features/guide';
import { isDemoModeActive } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';

const KEY = 'blacktop_tour_offered';
/** Only for someone who has just set up: a rider restoring an old profile has seen the app. */
const NEW_FOR_MS = 3 * 24 * 60 * 60 * 1000;
const asked = () => {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return true;
  }
};

/**
 * Once, on Home, for a rider who has just set up: watch the two-minute tour
 * (`/demo`) or not. Asked a moment after Home has settled, never again either
 * way (`blacktop_tour_offered`, left out of backups), not in demo mode and
 * not during a ride. Home's first-time tips are held back from the moment
 * it knows it will ask until it's answered, so the question always comes
 * first (they used to win the race and sit over it); a rider who goes to the
 * tour finds them waiting on Home when they come back.
 */
export function TourOffer({ blocked }: { blocked: boolean }) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const letGo = () => {
    release.current?.();
    release.current = null;
  };
  useEffect(() => letGo, []);

  useEffect(() => {
    if (blocked || isDemoModeActive()) return;
    const made = Date.parse(profile.createdAt || '');
    if (!Number.isFinite(made) || Date.now() - made > NEW_FOR_MS) return;
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    if (!release.current) release.current = holdTips();
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* asked this time only */
      }
      setOpen(true);
    }, 1200);
    return () => {
      window.clearTimeout(t);
      // Not asked after all (Home left before the moment came): the tips needn't wait.
      if (!asked()) letGo();
    };
  }, [blocked, profile.createdAt]);

  // Answered either way: the tips may come now (Radix's dialog is gone from the page by their next look).
  useEffect(() => {
    if (!open && release.current && asked()) letGo();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center mb-2">
            <Clapperboard className="w-6 h-6 text-accent" />
          </div>
          <DialogTitle>{tr("Watch a 2-minute tour?")}</DialogTitle>
          <DialogDescription>
            {tr("A quick film of what Blacktop can do, pausing on each part so you can take it in. You can watch it any time from Settings.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button variant="outline" className="h-12" onClick={() => setOpen(false)}>
            {tr("Not now")}
          </Button>
          <Button
            className="h-12 font-bold"
            onClick={() => {
              setOpen(false);
              navigate('/demo');
            }}
          >
            {tr("Watch")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
