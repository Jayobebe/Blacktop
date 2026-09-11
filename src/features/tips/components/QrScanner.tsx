import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { parsePayeeQr } from '../lib/nimiqPay';

interface QrScannerProps {
  /** Unique DOM id for the camera surface. */
  id: string;
  onResult: (result: { nim?: string; usdt?: string }) => void;
  onCancel: () => void;
}

export function QrScanner({ id, onResult, onCancel }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const stop = async () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { await scanner.clear(); } catch { /* already cleared */ }
    };

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(id);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decoded) => {
            const parsed = parsePayeeQr(decoded);
            if (!parsed || cancelled) return;
            await stop();
            onResult(parsed);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch {
        if (cancelled) return;
        setStarting(false);
        toast.error('Camera unavailable', { description: 'Allow camera access to scan a QR code.' });
        onCancel();
      }
    };

    void start();
    return () => {
      cancelled = true;
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-2">
      <div id={id} className="w-full rounded-xl overflow-hidden border border-border/40" />
      {starting && (
        <p className="text-[10px] text-muted-foreground text-center">Starting camera…</p>
      )}
      <Button variant="outline" onClick={onCancel} className="w-full h-10 rounded-xl">
        <X className="w-4 h-4 mr-2" /> Cancel scan
      </Button>
    </div>
  );
}
