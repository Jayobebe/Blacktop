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
  const [active, setActive] = useState<CollectedCard | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

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
      <div className="flex items-center gap-2 mb-3">
        <Folder className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-tight">Card Collection</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {collected.length} {collected.length === 1 ? 'card' : 'cards'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {collected.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setActive(card)}
            className="text-left animate-fade-in"
          >
            <MiniCard card={card} />
          </button>
        ))}

        <button
          type="button"
          onClick={startScanner}
          className="aspect-[5/7] rounded-2xl border-2 border-dashed border-border/50 bg-card/30 hover:bg-card/50 hover:border-accent/60 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground touch-target"
          aria-label="Add card by scanning QR"
        >
          <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[10px] uppercase tracking-widest">Scan card</span>
        </button>
      </div>

      {collected.length === 0 && (
        <p className="text-[10px] text-muted-foreground/70 text-center mt-3">
          Scan another rider's card QR to start your collection
        </p>
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

      {/* Detail view */}
      {active && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 safe-top safe-bottom"
          onClick={() => setActive(null)}
        >
          <button
            onClick={() => setActive(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-secondary hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[300px]">
            <FullCard card={active} />
            <button
              onClick={() => {
                removeCard(active.key);
                setActive(null);
                toast.success('Removed from collection');
              }}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" /> Remove from collection
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function MiniCard({ card }: { card: CollectedCard }) {
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  return (
    <div
      className={cn(
        'relative w-full aspect-[5/7] rounded-2xl border-2 overflow-hidden shadow-md flex flex-col p-2.5',
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
        <div className="absolute inset-0 pointer-events-none opacity-60 [background-image:radial-gradient(circle_at_25%_30%,white_0.5px,transparent_1px),radial-gradient(circle_at_70%_60%,white_0.5px,transparent_1px),radial-gradient(circle_at_45%_80%,white_0.5px,transparent_1px)] [background-size:120px_120px,140px_140px,100px_100px]" />
      )}
      <div className="relative flex-1 flex flex-col">
        <p className="text-[8px] uppercase tracking-widest text-white/60 truncate">
          {card.o ?? 'Anonymous'}
        </p>
        <h3 className="text-xs font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
          {card.n}
        </h3>
        {card.m && (
          <p className="text-[9px] uppercase tracking-wider text-white/60 truncate">{card.m}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider bg-black/40 text-white">
            <Sparkles className="w-2 h-2" />
            {card.tl}
          </span>
          <span className="font-mono text-[10px] text-white/80">{card.s.totalRides}r</span>
        </div>
      </div>
    </div>
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
