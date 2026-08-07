import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { Folder, ArrowLeft, ScanLine, Gauge, Route, Clock, Hash, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useSettings } from '@/features/settings';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  getDistanceLabel,
  getSpeedLabel,
} from '@/lib/format';
import { TIER_STYLES } from '../types';
import { decodeCard } from '../lib/cardCodec';
import { useCollectedCards, type CollectedCard } from '../hooks/useCollectedCards';

const SCANNER_ID = 'collected-cards-qr-scanner';

export function CollectedCardsFolder() {
  const { collected, addCard, rescanCard, removeCard } = useCollectedCards();
  const [showScanner, setShowScanner] = useState(false);
  const [rescanKey, setRescanKey] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCurrentIdx(Math.round(el.scrollTop / el.clientHeight));
  };

  const startScanner = async (keyToRescan: string | null = null) => {
    if (scannerRef.current || showScanner) return;
    haptics.light();
    setRescanKey(keyToRescan);
    setShowScanner(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const qr = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = qr;
      const edge = Math.min(window.innerWidth, window.innerHeight);
      const box = Math.max(180, Math.round(Math.min(edge * 0.7, 280)));

      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: box, height: box } },
        (decoded) => {
          const payload = decodeCard(decoded);
          if (!payload) return;
          haptics.light();
          if (keyToRescan !== null) {
            rescanCard(keyToRescan, payload);
            toast.success(`${payload.n} updated`);
          } else {
            const { added } = addCard(payload);
            if (added) {
              toast.success(`Added ${payload.n} to your collection`);
            } else {
              toast.info(`${payload.n} is already in your collection`);
            }
          }
          void stopScanner();
        },
        () => {},
      );
    } catch (err) {
      console.error('[CollectedCardsFolder] Scanner error:', err);
      const failedScanner = scannerRef.current;
      scannerRef.current = null;
      if (failedScanner && !failedScanner.isScanning) {
        try {
          failedScanner.clear();
        } catch {
          // The scanner never reached a clearable state.
        }
      }
      toast.error('Could not access camera', {
        description: err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied'
          : 'Close other camera views and try again',
      });
      setShowScanner(false);
      setRescanKey(null);
    }
  };


  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        // ignore
      }
    }
    setShowScanner(false);
    setRescanKey(null);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <section className="w-full">
      {/* Header — scan button always visible here, no scrolling required */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Folder className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-tight">Card Collection</h2>
        {collected.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            {Math.min(currentIdx + 1, collected.length)} / {collected.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => startScanner(null)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors text-xs font-medium"
          aria-label="Scan a card"
        >
          <ScanLine className="w-3.5 h-3.5" />
          Scan card
        </button>
      </div>

      {collected.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
          <p className="text-xs text-muted-foreground/60 text-center">
            Scan another rider's card QR to start your collection
          </p>
        </div>
      ) : (
        <>
          {/* Vertical snap carousel — cards only, no scroll-to-scan */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[85vh] overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {collected.map((card) => (
              <div
                key={card.key}
                className="h-full snap-start flex flex-col items-center justify-center gap-3 px-4 py-6"
              >
                <div className="w-full max-w-[300px]">
                  <FullCard card={card} />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startScanner(card.key)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/60 text-foreground hover:bg-secondary transition-colors text-sm font-medium"
                    >
                      <RefreshCw className="w-4 h-4" /> Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeCard(card.key);
                        toast.success('Removed from collection');
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dot indicators */}
          {collected.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-3 pb-2">
              {Array.from({ length: collected.length }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200',
                    i === currentIdx ? 'w-6 bg-accent' : 'w-1.5 bg-muted-foreground/30',
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Scanner portal — rendered at document.body to escape the World page's
          transform stacking context, which would otherwise make fixed positioning
          scroll with the page instead of anchoring to the viewport. */}
      {showScanner && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3">
            <button
              onClick={stopScanner}
              className="p-2.5 rounded-xl bg-secondary hover:bg-muted transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold">
              {rescanKey ? 'Rescan Card' : 'Scan Card QR'}
            </h2>
          </div>

          <div className="flex-1 overflow-hidden">
            <div id={SCANNER_ID} className="w-full h-full" />
          </div>

          <p className="flex-shrink-0 text-center text-muted-foreground text-xs px-6 py-3">
            {rescanKey
              ? "Point at the rider's updated QR to refresh their card"
              : "Point your camera at a rider's card QR"}
          </p>
        </div>,
        document.body,
      )}
    </section>
  );
}


function FullCard({ card }: { card: CollectedCard }) {
  const { settings } = useSettings();
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  return (
    <div
      className={cn(
        'relative w-full aspect-[5/7] rounded-2xl border-2 overflow-hidden shadow-xl flex flex-col p-3.5 gap-2.5',
        style.bg,
        style.border,
      )}
    >
      {style.shine && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 animate-card-shine" />
        </div>
      )}
      {style.sparkle && (
        <div className="absolute inset-0 pointer-events-none opacity-60 [background-image:radial-gradient(circle_at_20%_30%,white_0.5px,transparent_1px),radial-gradient(circle_at_70%_60%,white_0.5px,transparent_1px),radial-gradient(circle_at_45%_80%,white_0.5px,transparent_1px),radial-gradient(circle_at_85%_20%,white_0.5px,transparent_1px)] [background-size:120px_120px,140px_140px,100px_100px,160px_160px]" />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-white/60 truncate">
            {card.o ?? 'Anonymous rider'}
          </p>
          <h3 className="text-base font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
            {card.n}
          </h3>
          {card.m && (
            <p className="text-[10px] uppercase tracking-wider text-white/70 truncate">{card.m}</p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-black/50 text-white shrink-0">
          <Sparkles className="w-2.5 h-2.5" />
          {card.tl}
        </span>
      </div>

      <div className="relative grid grid-cols-2 gap-1.5 mt-auto">
        <Stat icon={Gauge} label="Top speed" value={`${formatSpeed(card.s.topSpeedMph, settings.speedUnit)}`} unit={getSpeedLabel(settings.speedUnit)} />
        <Stat icon={Clock} label="Time" value={formatDuration(card.s.totalDurationSec)} unit="" />
        <Stat icon={Route} label="Distance" value={formatDistance(card.s.totalDistanceMi, settings.distanceUnit)} unit={getDistanceLabel(settings.distanceUnit)} />
        <Stat icon={Hash} label="Rides" value={`${card.s.totalRides}`} unit="" />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, unit }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-black/35 backdrop-blur-sm border border-white/10 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-white/60">
        <Icon className="w-2.5 h-2.5" />
        <span className="truncate">{label}</span>
      </div>
      <p className="font-mono text-sm font-bold text-white leading-tight truncate">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-white/70">{unit}</span>}
      </p>
    </div>
  );
}
