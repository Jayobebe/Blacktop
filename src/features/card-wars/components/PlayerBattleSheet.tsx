import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2, ScanLine, Share2, Swords, Trophy, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { shareOrigin } from '@/lib/platform';
import { loadQrScanner } from '@/lib/qrScanner';
import { tr } from '@/lib/i18n';
import { RULES } from '../lib/rules';
import type { OnlineBattle } from '../lib/online';

const CODE = /^[a-f0-9-]{36}$/i;

/** Share sheet where the phone has one, otherwise the link on the clipboard. */
async function shareInvitation(url: string) {
  const text = tr("Battle me at Card Wars on Blacktop: {0}", [url]);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success(tr("Link copied"));
  } catch {
    toast.error(tr("Could not copy the link"));
  }
}

/**
 * Battling another rider: invite one (a QR code, a link or the code itself) or
 * accept an invitation. Both put RPM in and the winner takes the pot; the
 * server holds the stakes and settles every round.
 */
export function PlayerBattleSheet({
  open,
  onClose,
  online,
  code,
  onCode,
  busy,
  why,
  secondsLeft,
  onInvite,
  onJoin,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  online: OnlineBattle | null;
  code: string;
  onCode: (code: string) => void;
  busy: boolean;
  /** Why this player can't battle another right now (no deck yet, not enough RPM…). */
  why: string | null;
  /** Seconds until an open invitation lapses. */
  secondsLeft: number | null;
  onInvite: () => void;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const demo = useDemoLocked();
  const [scan, setScan] = useState(false);
  const waiting = online?.status === 'waiting' && !!online.code;
  const link = waiting ? `${shareOrigin()}/arcade/card-wars?battle=${online.code}` : '';
  const blocked = !!why || demo || busy;

  useEffect(() => {
    if (!open) setScan(false);
  }, [open]);

  // The scanner library loads the moment a scan starts.
  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    let scanner: InstanceType<Awaited<ReturnType<typeof loadQrScanner>>> | null = null;
    void (async () => {
      try {
        const Qr = await loadQrScanner();
        if (cancelled) return;
        scanner = new Qr('cw-scanner');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: 220 },
          (text) => {
            try {
              const value = new URL(text).searchParams.get('battle');
              if (value && CODE.test(value)) {
                onCode(value);
                setScan(false);
              }
            } catch {
              /* not a battle link */
            }
          },
          () => undefined,
        );
      } catch {
        setScan(false);
        toast.error(tr("Could not access camera"));
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      if (s)
        void (async () => {
          if (s.isScanning) await s.stop();
          s.clear();
        })().catch(() => undefined);
    };
    // onCode is the caller's setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <div className="max-w-md mx-auto space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("Battle a player")}</SheetTitle>
            <SheetDescription>{tr("Card against card, with RPM on it.")}</SheetDescription>
          </SheetHeader>

          <ul className="cw-panel text-xs text-muted-foreground space-y-1.5">
            <li className="flex gap-2">
              <Users className="w-4 h-4 text-accent shrink-0" />
              {tr("You each put in {0} RPM.", [RULES.stake])}
            </li>
            <li className="flex gap-2">
              <Trophy className="w-4 h-4 text-accent shrink-0" />
              {tr("The winner takes {0} RPM. A draw hands both stakes back.", [RULES.pot])}
            </li>
            <li className="flex gap-2">
              <Swords className="w-4 h-4 text-accent shrink-0" />
              {tr("Nobody loses a card, but the cards that fight still wear. You have two minutes for each round.")}
            </li>
          </ul>

          {waiting ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                <QRCodeSVG value={link} size={184} />
              </div>
              <p className="text-sm font-semibold">{tr("Have your rival scan this, or send them the invitation.")}</p>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                {secondsLeft === null ? tr("Waiting for your rival…") : tr("Waiting for your rival · the invitation lasts another {0} s", [secondsLeft])}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12 gap-2" onClick={() => void shareInvitation(link)}>
                  <Share2 className="w-4 h-4" />
                  {tr("Send invitation")}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 gap-2"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(online?.code || '')
                      .then(() => toast.success(tr("Copied")))
                      .catch(() => undefined)
                  }
                >
                  <Copy className="w-4 h-4" />
                  {tr("Copy battle code")}
                </Button>
              </div>
              <Button variant="ghost" className="h-11 gap-2 text-muted-foreground" disabled={busy} onClick={onCancel}>
                <X className="w-4 h-4" />
                {tr("Cancel and take my {0} RPM back", [RULES.stake])}
              </Button>
            </div>
          ) : (
            <>
              {why && (
                <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
                  {why}
                </p>
              )}
              <Button className="w-full h-14 text-base font-bold gap-2" disabled={blocked} onClick={onInvite}>
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Swords className="w-5 h-5" />}
                {tr("Invite a player · {0} RPM", [RULES.stake])}
              </Button>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Been invited?")}</p>
                <div className="flex gap-2">
                  <Input aria-label={tr("Battle code")} placeholder={tr("Battle code")} value={code} disabled={demo} onChange={(e) => onCode(e.target.value)} className="h-12 font-mono text-xs" />
                  <Button variant="outline" className="h-12 w-12 p-0 shrink-0" disabled={demo} onClick={() => setScan(!scan)} aria-label={tr("Scan battle QR")} aria-pressed={scan}>
                    <ScanLine className="w-5 h-5" />
                  </Button>
                </div>
                {scan && <div id="cw-scanner" className="overflow-hidden rounded-2xl" />}
                <Button variant="outline" className="w-full h-12 gap-2" disabled={blocked || !CODE.test(code.trim())} onClick={onJoin}>
                  {tr("Accept · {0} RPM", [RULES.stake])}
                </Button>
              </div>
              {demo && <DemoLockNote />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
