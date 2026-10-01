import { useEffect, useState } from 'react';
import { Maximize } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { tr } from '@/lib/i18n';
import {
  canNimiqFullscreen,
  enterNimiqFullscreen,
  fullscreenPromptMuted,
  fullscreenPromptOpeners as openers,
  muteFullscreenPrompt,
  useNimiqFullscreen,
} from '@/lib/nimiqFullscreen';

let askedThisLaunch = false;

/**
 * Inside a Nimiq Pay that can go full screen: asks once per launch (unless the
 * rider said not to), and whenever Settings asks. Nothing elsewhere.
 */
export function NimiqFullscreenPrompt() {
  const [open, setOpen] = useState(false);
  const full = useNimiqFullscreen();

  useEffect(() => {
    const opener = () => setOpen(true);
    openers.add(opener);
    if (!askedThisLaunch && canNimiqFullscreen() && !fullscreenPromptMuted()) {
      askedThisLaunch = true;
      // A beat after launch, once the first screen has drawn.
      const t = setTimeout(opener, 1500);
      return () => {
        clearTimeout(t);
        openers.delete(opener);
      };
    }
    return () => {
      openers.delete(opener);
    };
  }, []);

  if (!canNimiqFullscreen()) return null;
  return (
    <AlertDialog open={open && !full} onOpenChange={setOpen}>
      <AlertDialogContent className="frost-accent max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Maximize className="w-5 h-5 text-accent" />
            {tr("Go full screen?")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {tr("Blacktop works best full screen: more room for the map and the ride screen. Leave any time with Nimiq Pay's button or Back.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={() => {
              muteFullscreenPrompt(true);
            }}
          >
            {tr("Don't ask again")}
          </AlertDialogCancel>
          <AlertDialogCancel>{tr("Not now")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              muteFullscreenPrompt(false);
              void enterNimiqFullscreen();
            }}
          >
            {tr("Go full screen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
