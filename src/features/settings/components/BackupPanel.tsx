import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { requestPattern } from '@/features/alarm';
import { getActiveRideStatus, usePeaksHidden } from '@/features/ride';
import { backupFileName, makeBackup, parseBackup, restoreBackup, type Backup } from '@/lib/backup';
import { useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { shareFileNative } from '@/lib/nativeShare';
import { isNativeApp } from '@/lib/platform';

/** Hands the rider the file: the share sheet in the app and where the browser has one for files, a download otherwise. */
async function saveFile(name: string, text: string) {
  if (isNativeApp()) {
    await shareFileNative(name, new Blob([text], { type: 'application/json' }), tr("Blacktop backup"));
    return;
  }
  const file = new File([text], name, { type: 'application/json' });
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: tr("Blacktop backup") });
      return;
    }
  } catch (e) {
    // Closing the share sheet isn't a failure, and isn't a reason to download instead.
    if ((e as Error)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Settings → Privacy: save everything on this phone to a file, and bring a
 * file back (`lib/backup.ts` says what's in it). With Public Road Privacy on,
 * saving needs the unlock pattern: the file holds the peaks the screen hides.
 * Off in demo mode, which saves nothing and must not be overwritten by a file.
 */
export function BackupPanel() {
  const { enabled: demo } = useDemoMode();
  const peaksHidden = usePeaksHidden();
  const picker = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  const save = async () => {
    if (demo) return;
    if (peaksHidden && !(await requestPattern('check', tr("Draw your unlock pattern"), tr("A backup holds your peak speed, lean and G.")))) return;
    try {
      const backup = makeBackup();
      await saveFile(backupFileName(backup), JSON.stringify(backup));
    } catch (e) {
      console.error('[Backup] save failed', e);
      toast.error(tr("Couldn't save the backup — try again."));
    }
  };

  const picked = async (file: File | undefined) => {
    if (!file || demo) return;
    if (getActiveRideStatus().isActive) {
      toast.error(tr("End your ride before restoring a backup."));
      return;
    }
    const backup = parseBackup(await file.text().catch(() => ''));
    if (!backup) {
      toast.error(tr("That isn't a Blacktop backup file."));
      return;
    }
    setPending(backup);
  };

  const restore = () => {
    if (!pending || demo) return;
    if (!restoreBackup(pending)) {
      setPending(null);
      toast.error(tr("Not enough room on this phone to restore that backup. Nothing was changed."));
      return;
    }
    // Every store read storage when the app started: start again on the restored data.
    window.location.reload();
  };

  const madeOn = pending?.at ? new Date(pending.at).toLocaleDateString() : '';

  return (
    <div className="mt-4 pt-3 border-t border-border/30">
      <p className="text-sm font-medium">{tr("Back up this phone")}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {tr("Your rides, garage, logbook, cards, tracks and settings live on this phone only. Save them to a file you keep, and bring them back on a new phone.")}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={save} disabled={demo} className="h-12 text-xs rounded-lg touch-target">
          <Download className="w-4 h-4 mr-1.5" />
          {tr("Save a backup")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => picker.current?.click()} disabled={demo} className="h-12 text-xs rounded-lg touch-target">
          <Upload className="w-4 h-4 mr-1.5" />
          {tr("Restore a backup")}
        </Button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void picked(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        {demo ? tr("Not available in demo mode") : tr("Card Wars, crew scores and Track Day records stay with your account and aren't in the file.")}
      </p>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Restore this backup?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {madeOn
                ? tr("It replaces the rides, garage, logbook, cards, tracks and settings on this phone with the ones in the file, saved {0}. This can't be undone.", [madeOn])
                : tr("It replaces the rides, garage, logbook, cards, tracks and settings on this phone with the ones in the file. This can't be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>{tr("Restore")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
