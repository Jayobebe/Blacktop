import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Copy, KeyRound, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DemoLockNote } from '@/components/DemoLock';
import { getActiveRideStatus } from '@/features/ride';
import { useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { checkRecoveryCode, createRecoveryCode, hasRecoveryCode, isCodeShaped, pendingRecoveryCode, recoveryAvailable, recoveryCodeSaved, switchToRecovered } from '@/lib/recovery';

/**
 * Settings → Privacy, under the backup: the account's recovery code
 * (`lib/recovery.ts`). Make one (shown until the rider says it's saved, then
 * never again), or enter one to make this phone that account. Hidden until
 * the server has the `account-recovery` function; dead in demo mode like
 * every other code box.
 */
export function RecoveryPanel() {
  const { enabled: demo } = useDemoMode();
  const [ready, setReady] = useState(false);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  /** A new code on show. */
  const [code, setCode] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState('');
  /** A checked code, waiting for the rider to agree to the switch. */
  const [found, setFound] = useState<Session | null>(null);

  useEffect(() => {
    if (demo) return;
    let live = true;
    void recoveryAvailable().then(async (ok) => {
      if (!live || !ok) return;
      const [mine, waiting] = await Promise.all([hasRecoveryCode(), pendingRecoveryCode()]);
      if (!live) return;
      setHas(mine);
      // Made earlier, never marked as saved: show it again.
      if (waiting) setCode(waiting);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [demo]);

  const make = async () => {
    if (demo || busy) return;
    setBusy(true);
    const made = await createRecoveryCode();
    setBusy(false);
    if ('error' in made) {
      toast.error(made.error === 'unavailable' ? tr("Recovery codes aren't available right now.") : tr("Couldn't make a recovery code — try again."));
      return;
    }
    setHas(true);
    setCode(made.code);
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success(tr("Code copied"));
    } catch {
      // No clipboard here: it's on screen to write down.
    }
  };

  const check = async () => {
    if (demo || busy) return;
    if (getActiveRideStatus().isActive) {
      toast.error(tr("End your ride before using a recovery code."));
      return;
    }
    setBusy(true);
    const result = await checkRecoveryCode(typed);
    setBusy(false);
    if ('error' in result) {
      toast.error(result.error === 'wrong' ? tr("That code isn't right.") : tr("Couldn't reach the server — check your connection and try again."));
      return;
    }
    if (result.same) {
      toast.success(tr("This phone is already on that account."));
      setEntering(false);
      setTyped('');
      return;
    }
    setEntering(false);
    setFound(result.session);
  };

  const swap = async () => {
    if (!found || demo) return;
    setBusy(true);
    const ok = await switchToRecovered(found);
    if (!ok) {
      setBusy(false);
      setFound(null);
      toast.error(tr("Couldn't reach the server — check your connection and try again."));
      return;
    }
    // Every store starts again as the recovered account.
    window.location.reload();
  };

  if (demo) {
    return (
      <div className="mt-4 pt-3 border-t border-border/30">
        <p className="text-sm font-medium">{tr("Recovery code")}</p>
        <DemoLockNote className="mt-2 justify-start text-left" />
      </div>
    );
  }
  if (!ready) return null;

  return (
    <div className="mt-4 pt-3 border-t border-border/30">
      <p className="text-sm font-medium">{tr("Recovery code")}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {tr("A recovery code brings your account (Card Wars, crew scores, Track Day records) back on another phone. Blacktop keeps no email or name for you, so the code is the only way in: write it down.")}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={make} disabled={busy} className="h-12 text-xs rounded-lg touch-target">
          <KeyRound className="w-4 h-4 mr-1.5" />
          {has ? tr("Make a new code") : tr("Make a recovery code")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEntering(true)} disabled={busy} className="h-12 text-xs rounded-lg touch-target">
          <LogIn className="w-4 h-4 mr-1.5" />
          {tr("Use a recovery code")}
        </Button>
      </div>
      {has && <p className="text-[10px] text-muted-foreground/70 mt-2">{tr("This account has a recovery code. Making a new one stops the old one working.")}</p>}

      {/* The new code: it stays until the rider says it's saved. */}
      <Dialog open={!!code} onOpenChange={() => undefined}>
        <DialogContent className="[&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{tr("Your recovery code")}</DialogTitle>
            <DialogDescription>{tr("Write it down or save it somewhere safe. Anyone who has it can take over your account, and it can't be shown again.")}</DialogDescription>
          </DialogHeader>
          <p className="font-mono text-lg font-bold text-center tracking-wider break-all select-all rounded-xl bg-secondary px-3 py-4">{code}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 rounded-xl" onClick={copy}>
              <Copy className="w-4 h-4 mr-1.5" />
              {tr("Copy")}
            </Button>
            <Button
              className="h-12 rounded-xl"
              onClick={() => {
                recoveryCodeSaved();
                setCode(null);
              }}
            >
              {tr("I've saved it")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={entering}
        onOpenChange={(open) => {
          if (busy) return;
          setEntering(open);
          if (!open) setTyped('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Enter your recovery code")}</DialogTitle>
            <DialogDescription>{tr("The code you saved when you made it on your other phone.")}</DialogDescription>
          </DialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="h-12 font-mono text-center uppercase tracking-wider"
          />
          <Button className="h-12 rounded-xl" onClick={check} disabled={busy || !isCodeShaped(typed)}>
            {tr("Continue")}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!found} onOpenChange={(open) => !open && !busy && setFound(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Switch this phone to that account?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("The account on this phone now, with its Card Wars cards, crew scores and Track Day records, is deleted and replaced by the one you're recovering. This can't be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // Stay open until the switch has happened.
                e.preventDefault();
                void swap();
              }}
            >
              {tr("Switch account")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
