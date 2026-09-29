import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { tr } from '@/lib/i18n';
import { parseEnterpriseCode } from '../lib/qrParser';
import type { GuestSessionPayload } from '../types';

/**
 * Camera scanner for enterprise codes. Loaded on demand by the Doorway (the
 * scanner library stays out of Home's first load). Ignores QR codes that
 * aren't enterprise codes and keeps looking.
 */
export default function EnterpriseQrScanner({
  onResult,
  onError,
}: {
  onResult: (payload: GuestSessionPayload) => void;
  onError: () => void;
}) {
  const id = useRef(`bt-enterprise-qr-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [starting, setStarting] = useState(true);
  const cb = useRef({ onResult, onError });
  cb.current = { onResult, onError };

  useEffect(() => {
    let cancelled = false;
    const stop = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try {
        await s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.clear();
      } catch {
        /* already cleared */
      }
    };
    (async () => {
      try {
        const s = new Html5Qrcode(id);
        scannerRef.current = s;
        await s.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          async (decoded) => {
            const parsed = parseEnterpriseCode(decoded);
            if (!parsed || cancelled) return;
            cancelled = true;
            await stop();
            cb.current.onResult(parsed);
          },
          () => {},
        );
        if (!cancelled) setStarting(false);
      } catch {
        if (!cancelled) cb.current.onError();
      }
    })();
    return () => {
      cancelled = true;
      void stop();
    };
  }, [id]);

  return (
    <div className="space-y-2">
      <div id={id} className="w-full aspect-square max-h-64 rounded-2xl overflow-hidden border border-accent/30 bg-background/40" />
      {starting && <p className="text-[10px] text-muted-foreground text-center">{tr("Starting camera…")}</p>}
    </div>
  );
}
