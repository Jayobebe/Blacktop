import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DemoLockNote } from '@/components/DemoLock';
import { parseBackup, restoreBackup, type Backup } from '@/lib/backup';
import { useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { checkRecoveryCode, isCodeShaped, switchToRecovered } from '@/lib/recovery';

/** The name a restored backup carries, for an account made to go with it. */
function restoredName(): string {
  try {
    const name = (JSON.parse(localStorage.getItem('blacktop_profile') || '{}') as { name?: unknown }).name;
    return typeof name === 'string' ? name.trim() : '';
  } catch {
    return '';
  }
}

/**
 * The welcome screen's Recover button: someone who already rides with
 * Blacktop, on a new phone. A recovery code (the account), a backup file
 * (what was on the old phone), or both, and they're on their own Home with
 * no onboarding. The code is checked before anything on the phone changes.
 * With only a file, an account is made under the name in it.
 */
export function WelcomeRecovery({ open, onOpenChange, createProfile }: { open: boolean; onOpenChange: (open: boolean) => void; createProfile: (name: string) => Promise<boolean> }) {
  const { enabled: demo } = useDemoMode();
  const picker = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);

  const picked = async (file: File | undefined) => {
    if (!file) return;
    const read = parseBackup(await file.text().catch(() => ''));
    if (!read) {
      toast.error(tr("That isn't a Blacktop backup file."));
      return;
    }
    setBackup(read);
  };

  const hasCode = typed.trim().length > 0;
  const ready = !demo && !busy && (hasCode ? isCodeShaped(typed) : !!backup);

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    // The code first: nothing on this phone changes until it's known to be right.
    const account = hasCode ? await checkRecoveryCode(typed) : null;
    if (account && 'error' in account) {
      setBusy(false);
      toast.error(account.error === 'wrong' ? tr("That code isn't right.") : tr("Couldn't reach the server — check your connection and try again."));
      return;
    }
    if (backup && !restoreBackup(backup)) {
      setBusy(false);
      toast.error(tr("Not enough room on this phone to restore that backup. Nothing was changed."));
      return;
    }
    if (account) {
      if (!(await switchToRecovered(account.session))) {
        setBusy(false);
        toast.error(tr("Couldn't reach the server — check your connection and try again."));
        return;
      }
    } else {
      // A backup alone: a new account under the name it was saved with. Without one, setup asks for it.
      const name = restoredName();
      if (name) await createProfile(name);
    }
    // Every store starts again on what was brought back.
    window.location.assign('/');
  };

  const madeOn = backup?.at ? new Date(backup.at).toLocaleDateString() : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Welcome back")}</DialogTitle>
          <DialogDescription>{tr("Bring Blacktop back from your other phone. Use your recovery code, your backup file, or both.")}</DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-sm font-medium">{tr("Recovery code")}</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">{tr("Your account: Card Wars, crew scores and Track Day records.")}</p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={demo || busy}
            className="h-12 font-mono text-center uppercase tracking-wider"
          />
        </div>

        <div>
          <p className="text-sm font-medium">{tr("Backup file")}</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">{tr("What was on your phone: rides, garage, logbook, cards, tracks and settings.")}</p>
          <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => picker.current?.click()} disabled={demo || busy}>
            {backup ? <FileCheck2 className="w-4 h-4 mr-1.5 text-accent" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {!backup ? tr("Choose a backup file") : madeOn ? tr("Backup saved {0}", [madeOn]) : tr("Backup chosen")}
          </Button>
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
        </div>

        {demo && <DemoLockNote />}
        <Button className="h-12 rounded-xl" onClick={run} disabled={!ready}>
          {tr("Restore")}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          {tr("Restoring means you still agree to what you accepted when you first set up Blacktop.")}{' '}
          <Link to="/privacy" className="underline underline-offset-2">{tr("Privacy Policy")}</Link>
          {' · '}
          <Link to="/terms" className="underline underline-offset-2">{tr("Terms & Safety")}</Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
