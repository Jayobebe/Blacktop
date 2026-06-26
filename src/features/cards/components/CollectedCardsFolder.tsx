import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { Folder, Plus, X, Lock, Gauge, Route, Clock, Hash, Sparkles, Trash2 } from 'lucide-react';
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
  const { collected, addCard, removeCard } = useCollectedCards();
  const [showScanner, setShowScanner] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalSlides = collected.length + 1; // +1 for the scan slide

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCurrentIdx(Math.round(el.scrollTop / el.clientHeight));
  };

  const startScanner = async () => {
    haptics.light();
    setShowScanner(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const qr = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = qr;
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          const payload = decodeCard(decoded);
          if (!payload) return;
          const { added } = addCard(payload);
          haptics.light();
          toast.success(added ? `Added ${payload.n} to your collection` : `Updated ${payload.n}`);
          stopScanner();
        },
        () => {},
      );
    } catch (err) {
      console.error('[CollectedCardsFolder] Scanner error:', err);
      toast.error('Could not access camera', { description: 'Please check camera permissions' });
      setShowScanner(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setShowScanner(false);
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
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Folder className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-tight">Card Collection</h2>
        {collected.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {Math.min(currentIdx + 1, collected.length)} / {collected.length}
          </span>
        )}
      </div>

      {/* Vertical snap carousel */}
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
              <button
                type="button"
                onClick={() => {
                  removeCard(card.key);
                  toast.success('Removed from collection');
                }}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" /> Remove from collection
              </button>
            </div>
          </div>
        ))}

        {/* Scan slide — always last */}
        <div className="h-full snap-start flex flex-col items-center justify-center gap-4 px-4">
          {collected.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center">
              Scan another rider's card QR to start your collection
            </p>
          )}
          <button
            type="button"
            onClick={startScanner}
            className="aspect-[5/7] w-full max-w-[220px] rounded-2xl border-2 border-dashed border-border/50 bg-card/30 hover:bg-card/50 hover:border-accent/60 transition-colors flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-foreground touch-target"
            aria-label="Add card by scanning QR"
          >
            <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-xs uppercase tracking-widest">Scan card</span>
          </button>
        </div>
      </div>

      {/* Dot indicators */}
      {totalSlides > 1 && (
        <div className="flex justify-center gap-1.5 mt-3 pb-2">
          {Array.from({ length: totalSlides }, (_, i) => (
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

      {/* Scanner overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col safe-top safe-bottom">
          <div className="p-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Scan Card QR</h2>
            <button
              onClick={stopScanner}
              className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors"
              aria-label="Close scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div id={SCANNER_ID} className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden" />
          </div>
          <p className="text-center text-muted-foreground text-sm pb-8">
            Point your camera at a rider's card QR
          </p>
        </div>
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
