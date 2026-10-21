import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel, HeartPulse, CalendarDays, HardDrive, LayoutGrid, Route, Waypoints, Grid3x3, Square, Undo2, Search, Bell, Volume2, Sparkles, ChevronRight, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { notify } from '@/lib/inbox';
import { speak } from '@/features/map';
import { markWhatsNewSeen, releaseDate, releases, useWhatsNew, type Release, type ReleaseIcon } from '@/lib/whatsNew';

const ICON: Record<ReleaseIcon, LucideIcon> = {
  medical: HeartPulse,
  fuel: Fuel,
  calendar: CalendarDays,
  storage: HardDrive,
  console: LayoutGrid,
  trip: Route,
  route: Waypoints,
  pixels: Grid3x3,
  shape: Square,
  back: Undo2,
  search: Search,
  bell: Bell,
};

/** One release's lines, each with its icon and, where it has one, its link. */
export function ReleaseLines({ release, onGo }: { release: Release; onGo?: () => void }) {
  const navigate = useNavigate();
  return (
    <ul className="space-y-2.5">
      {release.lines.map((l, i) => {
        const I = ICON[l.icon] ?? Sparkles;
        return (
          <li key={i} className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <I className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0 text-sm leading-snug pt-1">
              {l.text}
              {l.to && l.link && (
                <button
                  type="button"
                  onClick={() => {
                    onGo?.();
                    navigate(l.to!);
                  }}
                  className="mt-1 flex items-center gap-0.5 text-xs font-semibold text-accent"
                >
                  {l.link} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The card after an update, once on Home (the caller holds it back during a
 * ride, a convoy, guidance or sticker arranging). Closing it, either way,
 * keeps it in Blacktop Console's notifications; All updates opens the list,
 * which is what stops the Settings glow.
 */
export function WhatsNewCard({ when }: { when: boolean }) {
  const navigate = useNavigate();
  const { card } = useWhatsNew();
  const [open, setOpen] = useState(false);
  // A moment after Home settles, so it doesn't land in the same breath as the page.
  useEffect(() => {
    if (!card || !when) return;
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [card, when]);
  const latest = releases()[0];
  if (!latest) return null;
  const close = () => {
    setOpen(false);
    markWhatsNewSeen();
    notify({ kind: 'general', title: tr("What's new in Blacktop"), body: latest.lines.map((l) => l.text).join(' '), url: '/whats-new' });
  };
  return (
    <Dialog open={open && card} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> {tr("What's new in Blacktop")}
          </DialogTitle>
          <DialogDescription>{releaseDate(latest.id)}</DialogDescription>
        </DialogHeader>
        <ReleaseLines release={latest} onGo={close} />
        <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-2">
          <Button
            variant="outline"
            onClick={() => void speak([tr("What's new in Blacktop"), ...latest.lines.map((l) => l.text)].join('. '))}
            aria-label={tr("Read it to me")}
            className="h-11 w-11 p-0 rounded-xl"
          >
            <Volume2 className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              close();
              navigate('/whats-new');
            }}
            className="h-11 rounded-xl text-xs"
          >
            {tr("All updates")}
          </Button>
          <Button onClick={close} className={cn('h-11 rounded-xl text-xs font-semibold')}>
            {tr("Got it")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
