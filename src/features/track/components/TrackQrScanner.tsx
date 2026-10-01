import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { loadQrScanner } from '@/lib/qrScanner';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

const SCANNER_ID = 'track-qr-scanner';

/**
 * Full-screen camera for Track Day's pairing QRs. `read` gets every decoded
 * text and returns true when it's the right kind of code (the scanner then
 * stops and closes); anything else is ignored and scanning carries on.
 */
export function TrackQrScanner({ title, hint, read, onClose }: { title: string; hint: string; read: (text: string) => boolean; onClose: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    let stopped = false;
    const stop = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      try {
        if (s?.isScanning) await s.stop();
        s?.clear();
      } catch {
        /* already stopped */
      }
    };
    (async () => {
      try {
        const qr = new (await loadQrScanner())(SCANNER_ID);
        if (stopped) return;
        scannerRef.current = qr;
        const edge = Math.min(window.innerWidth, window.innerHeight);
        const box = Math.max(180, Math.round(Math.min(edge * 0.7, 280)));
        await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: box, height: box } }, (decoded) => {
          if (!readRef.current(decoded)) return;
          haptics.success();
          void stop().then(onClose);
        }, () => {});
      } catch {
        toast.error(tr("Could not access camera"));
        onClose();
      }
    })();
    return () => {
      stopped = true;
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background flex flex-col safe-top safe-bottom">
      <div className="flex items-center justify-between p-4">
        <p className="font-semibold">{title}</p>
        <Button variant="ghost" onClick={onClose}>
          {tr("Cancel")}
        </Button>
      </div>
      <div id={SCANNER_ID} className="flex-1" />
      <p className="p-4 text-center text-xs text-muted-foreground">{hint}</p>
    </div>,
    document.body,
  );
}
