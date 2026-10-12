import { Navigation } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import { SNOOZE_ANSWERED_MS, SNOOZE_NOT_NOW_MS, useSetOffWatch } from '../hooks/useSetOffWatch';

interface SetOffPromptProps {
  /** Home is on screen with nothing else going on (no ride, convoy, guidance or map). */
  active: boolean;
  motorised: boolean;
  /** The main button: "Start ride", or "Start Convoy" for a group-only rider. */
  startLabel: string;
  onStart: () => void;
  onOpenMap: () => void;
}

/**
 * Home's "On the move?" card: Blacktop was open when the rider set off, so it
 * asks once whether to start tracking or open the map. Glove-sized buttons;
 * closing it any other way is "Not now".
 */
export function SetOffPrompt({ active, motorised, startLabel, onStart, onOpenMap }: SetOffPromptProps) {
  const [moving, dismiss] = useSetOffWatch(active, motorised);
  if (!moving) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss(SNOOZE_NOT_NOW_MS)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-accent" aria-hidden />
            {tr("On the move?")}
          </DialogTitle>
          <DialogDescription>{tr("Looks like you've set off. Start tracking, or open the map?")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="col-span-2 short:col-span-1 h-14 text-base font-semibold"
            onClick={() => {
              dismiss(SNOOZE_ANSWERED_MS);
              onStart();
            }}
          >
            {startLabel}
          </Button>
          <Button
            variant="outline"
            className="h-14"
            onClick={() => {
              dismiss(SNOOZE_ANSWERED_MS);
              onOpenMap();
            }}
          >
            {tr("Open map")}
          </Button>
          <Button variant="outline" className="h-14 short:col-span-2" onClick={() => dismiss(SNOOZE_NOT_NOW_MS)}>
            {tr("Not now")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
