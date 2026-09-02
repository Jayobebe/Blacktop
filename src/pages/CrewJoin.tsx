import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, ScanLine, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useCrew, joinCrew, leaveCrew, parseCrewQr } from '@/features/crew/useCrew';
import { toast } from 'sonner';

export default function CrewJoin() {
  const navigate = useNavigate();
  const crew = useCrew();
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'crew-qr-scanner';

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch {}
    try { await scanner.clear(); } catch {}
  };

  useEffect(() => () => { void stopScanner(); }, []);

  const startScanner = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          const code = parseCrewQr(decoded);
          if (!code) return;
          await stopScanner();
          setScanning(false);
          joinCrew(code);
          toast.success(`Joined crew ${code}`);
          navigate('/crew/convoys');
        },
        () => {},
      );
    } catch {
      setScanning(false);
      toast.error('Camera unavailable', { description: 'Allow camera access to scan a crew QR.' });
    }
  };

  const cancelScan = async () => {
    await stopScanner();
    setScanning(false);
  };

  return (
    <div className="min-h-dvh bg-background safe-top safe-bottom px-4 pt-4 pb-8">
      <header className="relative flex items-center justify-center pb-6">
        <button
          type="button"
          onClick={() => navigate('/world')}
          className="absolute left-0 top-0 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back to Blacktop World"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Join Crew</h1>
      </header>

      {scanning ? (
        <div className="space-y-4">
          <div id={containerId} className="w-full rounded-2xl overflow-hidden border border-border/40" />
          <button
            type="button"
            onClick={cancelScan}
            className="w-full py-3 rounded-xl border border-border/40 text-sm font-semibold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/40 bg-card/40 p-5 text-center">
            <Users className="w-6 h-6 mx-auto mb-3 text-accent" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current crew</p>
            <p className="text-2xl font-bold mt-1">{crew.code}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {crew.isOwn ? 'Your own crew' : 'Joined crew'}
            </p>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Scan a mate's crew QR from their Blacktop World page to ride in their crew.
          </p>

          <button
            type="button"
            onClick={startScanner}
            className="w-full py-4 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors flex items-center justify-center gap-2"
          >
            <ScanLine className="w-5 h-5" /> Scan crew QR
          </button>

          {!crew.isOwn && (
            <button
              type="button"
              onClick={() => { leaveCrew(); toast.success('Back in your own crew'); }}
              className="w-full py-3 rounded-xl border border-destructive/50 text-destructive text-sm font-semibold uppercase tracking-widest"
            >
              Leave crew
            </button>
          )}
        </div>
      )}
    </div>
  );
}
