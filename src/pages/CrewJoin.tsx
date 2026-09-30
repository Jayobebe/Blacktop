import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, ScanLine, X, AlertTriangle } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';
import { loadQrScanner } from '@/lib/qrScanner';
import { useCrew, joinCrew, parseCrewQr, MAX_CREWS } from '@/features/crew/useCrew';
import { toast } from 'sonner';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';

export default function CrewJoin() {
  const navigate = useNavigate();
  const crew = useCrew();
  const full = crew.crews.length >= MAX_CREWS;
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
      const scanner = new (await loadQrScanner())(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          const code = parseCrewQr(decoded);
          if (!code) return;
          await stopScanner();
          setScanning(false);
          const result = joinCrew(code);
          if (result === 'full') {
            toast.error(tr("All crew slots full"), { description: tr("Leave a crew from Crew QR on Blacktop World to join another.") });
            return;
          }
          toast.success(result === 'already' ? tr("Switched to crew {0}", [code]) : tr("Joined crew {0}", [code]));
          navigate('/crew/convoys');
        },
        () => {},
      );
    } catch {
      setScanning(false);
      toast.error(tr("Camera unavailable"), { description: tr("Allow camera access to scan a crew QR.") });
    }
  };

  const cancelScan = async () => {
    await stopScanner();
    setScanning(false);
  };

  return (
    <div className="min-h-dvh safe-top safe-bottom px-4 pt-4 pb-8">
      <PageHeader title={tr("Join Crew")} backTo="/world" backLabel={tr("Back to Blacktop World")} />

      {scanning ? (
        <div className="space-y-4">
          <div id={containerId} className="w-full rounded-2xl overflow-hidden border border-border/40" />
          <button
            type="button"
            onClick={cancelScan}
            className="w-full py-3 rounded-xl border border-border/40 text-sm font-semibold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />{" "}{tr("Cancel")}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/40 bg-card/40 p-5 text-center">
            <Users className="w-6 h-6 mx-auto mb-3 text-accent" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr("Current crew")}</p>
            <p className="text-2xl font-bold mt-1 break-words">{crew.name}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {crew.code} · {crew.isOwn ? tr("Your own crew") : tr("Joined crew")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
              {tr("{0} of {1} crew slots used", [crew.crews.length, MAX_CREWS])}
            </p>
          </div>

          {full && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-left">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{tr("All crew slots full")}</p>
                <p className="text-xs text-muted-foreground">{tr("Leave a crew from Crew QR on Blacktop World to join another.")}</p>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center">
            {tr("Scan a mate's crew QR from their Blacktop World page to ride in their crew.")}
          </p>

          <button
            type="button"
            onClick={startScanner}
            disabled={full}
            className="w-full py-4 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ScanLine className="w-5 h-5" />{" "}{tr("Scan crew QR")}
          </button>

          <p className="text-[11px] text-muted-foreground text-center">
            {tr("Rename, switch or leave your crews from Crew QR on Blacktop World.")}
          </p>
        </div>
      )}
    </div>
  );
}
