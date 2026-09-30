import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Html5Qrcode } from 'html5-qrcode';
import { loadQrScanner } from '@/lib/qrScanner';
import { ArrowLeft, BookOpen, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { useProfile } from '@/features/profile';
import { useGarage } from '@/features/garage';
import { setInheritedLog } from '../lib/logbookStore';
import { parseLogbookQr, receiveLogbook } from '../lib/transfer';
import { tr } from '@/lib/i18n';

const SCANNER_ID = 'logbook-qr-scanner';

/**
 * "Receive logbook": scan another rider's hand-over code, pull the logbook
 * across and add the vehicle (with its history, card and stats) to this
 * garage. Inherited history never counts toward this rider's own totals.
 */
export function LogbookReceiver({ trigger }: { trigger: (open: () => void) => React.ReactNode }) {
  const { profile } = useProfile();
  const { importBike } = useGarage();
  const { enabled: demoEnabled } = useDemoMode();
  const [scanning, setScanning] = useState(false);
  const [state, setState] = useState<null | { phase: 'receiving' | 'done' | 'failed'; progress: number; vehicle?: string; msg?: string }>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const stopScanner = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        if (s.isScanning) await s.stop();
        s.clear();
      } catch {
        /* ignore */
      }
    }
    setScanning(false);
  };

  const begin = (token: string) => {
    setState({ phase: 'receiving', progress: 0 });
    stopRef.current = receiveLogbook(token, profile.name || 'Rider', {
      onProgress: (p, vehicle) => setState((s) => (s ? { ...s, progress: p, vehicle: vehicle || s.vehicle } : s)),
      onPackage: (pkg) => {
        const id = importBike(pkg.bike);
        setInheritedLog(id, pkg.log);
        haptics.success();
        setState({ phase: 'done', progress: 1, vehicle: pkg.bike.name, msg: `From ${pkg.fromName}` });
        return true;
      },
      onFailed: (msg) => setState({ phase: 'failed', progress: 0, msg }),
    });
  };

  const open = async () => {
    if (demoEnabled) {
      toast(tr("Receiving a logbook is off in demo mode"));
      return;
    }
    setScanning(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const qr = new (await loadQrScanner())(SCANNER_ID);
      scannerRef.current = qr;
      const edge = Math.min(window.innerWidth, window.innerHeight);
      const box = Math.max(180, Math.round(Math.min(edge * 0.7, 280)));
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: box, height: box } },
        (decoded) => {
          const token = parseLogbookQr(decoded);
          if (!token) return;
          void stopScanner();
          begin(token);
        },
        () => {},
      );
    } catch (err) {
      console.error('[Logbook] scanner error', err);
      toast.error(tr("Could not access camera"));
      setScanning(false);
    }
  };

  useEffect(
    () => () => {
      scannerRef.current?.stop().catch(() => {});
      stopRef.current?.();
    },
    [],
  );

  return (
    <>
      {trigger(() => void open())}

      {scanning &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-background flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => void stopScanner()} className="p-2.5 rounded-xl bg-secondary hover:bg-muted" aria-label={tr("Back")}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-semibold">{tr("Receive logbook")}</h2>
            </div>
            <div className="flex-1 overflow-hidden">
              <div id={SCANNER_ID} className="w-full h-full" />
            </div>
            <p className="text-center text-muted-foreground text-xs px-6 py-3">
              {tr("Scan the code on their Logbook's hand-over page. It's only live for 10 seconds.")}
            </p>
          </div>,
          document.body,
        )}

      {state &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-6">
            <div className="w-full max-w-xs flex flex-col items-center text-center gap-4">
              {state.phase === 'receiving' && (
                <>
                  <BookOpen className="w-10 h-10 text-accent" />
                  <p className="text-sm font-semibold">{tr("Receiving")}{" "}{state.vehicle ? tr("{0}'s", [state.vehicle]) : 'the'}{" "}{tr("logbook…")}</p>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(state.progress * 100)}%` }} />
                  </div>
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </>
              )}
              {state.phase === 'done' && (
                <>
                  <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                    <Check className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-sm font-semibold">{state.vehicle}{" "}{tr("is in your garage")}</p>
                  <p className="text-xs text-muted-foreground">{state.msg}{tr(". Its logbook, card and stats came with it; your own totals are unchanged.")}</p>
                  <Button onClick={() => setState(null)}>{tr("Nice")}</Button>
                </>
              )}
              {state.phase === 'failed' && (
                <>
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <X className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold">{tr("No logbook received")}</p>
                  <p className="text-xs text-muted-foreground">{state.msg}</p>
                  <Button onClick={() => setState(null)}>{tr("OK")}</Button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
