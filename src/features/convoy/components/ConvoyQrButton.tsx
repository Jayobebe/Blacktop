import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * The ride screen's convoy QR, for every member (not just the leader): a small
 * button by the live speed, and the convoy's code as a QR over the screen with
 * a close button, for a rider who turns up mid-ride. The QR is the same one the
 * lobby shows (the bare code, which Join Convoy's scanner reads).
 */
export function ConvoyQrButton({ code, className }: { code: string; className?: string }) {
  const [open, setOpen] = useState(false);

  // Escape (and Android's Back, which NativeBridge sends as Escape to dialogs) closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr("Show the convoy's QR code")}
        data-tip="ride-qr"
        className={cn(
          'glove-hit w-11 h-11 rounded-xl flex items-center justify-center frost-accent bg-card/80 border border-border shadow-lg pressable',
          className,
        )}
      >
        <QrCode className="w-5 h-5 text-accent" />
      </button>
      {open &&
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
                <QRCodeSVG value={code} size={220} level="H" includeMargin bgColor="#ffffff" fgColor="#000000" className="short:w-[180px] short:h-[180px]" />
              </div>
              <div className="flex flex-col items-center short:items-start gap-3 text-center short:text-left">
                <p className="font-mono text-3xl font-black tracking-[0.25em] text-foreground">{code}</p>
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
