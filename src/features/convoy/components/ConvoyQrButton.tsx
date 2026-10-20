import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, X, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * The ride screen's convoy QR, for everyone riding (not just the leader): a
 * pill in the header row beside the LEADER / CONVOY pill, and the convoy's code
 * as a QR over the screen with a close button, for a rider who turns up
 * mid-ride. On a solo ride there's no convoy yet: `getCode` makes one (a convoy
 * of one, the ride already going) and the ride becomes a convoy ride the moment
 * someone joins, as a ride from an unlocked solo lobby does. The QR is the bare
 * code, which Join Convoy's scanner reads.
 */
export function ConvoyQrButton({
  code,
  getCode,
  className,
}: {
  code: string | null;
  /** No convoy yet (a solo ride): make one and hand back its code. */
  getCode?: () => Promise<string | null>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Escape (and Android's Back, which NativeBridge sends as Escape to dialogs) closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const show = async () => {
    if (busy) return;
    let c = code;
    if (!c && getCode) {
      setBusy(true);
      try {
        c = await getCode();
      } finally {
        setBusy(false);
      }
    }
    if (!c) return;
    setShown(c);
    setOpen(true);
  };

  const qr = code ?? shown;
  return (
    <>
      <button
        type="button"
        onClick={() => void show()}
        aria-label={tr("Show the convoy's QR code")}
        data-tip="ride-qr"
        className={cn('glove-hit flex items-center gap-1 text-accent text-xs font-medium px-2 py-0.5 bg-accent/10 rounded pressable', className)}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
        QR
      </button>
      {open && qr &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tr("Show the convoy's QR code")}
            className="fixed inset-0 z-[1100] safe-frame flex items-center justify-center p-3 bg-background/90 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative flex flex-col short:flex-row items-center gap-4 short:gap-6 max-h-full overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white p-5 short:p-3 rounded-3xl shadow-2xl">
                <QRCodeSVG value={qr} size={220} level="H" includeMargin bgColor="#ffffff" fgColor="#000000" className="short:w-[180px] short:h-[180px]" />
              </div>
              <div className="flex flex-col items-center short:items-start gap-3 text-center short:text-left">
                <p className="font-mono text-3xl font-black tracking-[0.25em] text-foreground">{qr}</p>
                <p className="text-sm text-muted-foreground max-w-[16rem]">{tr("Scan this from Join Convoy to join the ride.")}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="touch-target h-12 px-6 rounded-2xl frost-accent bg-card/90 border border-border flex items-center gap-2 font-semibold pressable"
                >
                  <X className="w-4 h-4 text-accent" />
                  {tr("Close")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
