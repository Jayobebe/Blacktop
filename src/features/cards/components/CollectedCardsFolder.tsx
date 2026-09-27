import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { Folder, ArrowLeft, ScanLine, Gauge, Route, Clock, Hash, Sparkles, Trash2, RefreshCw, Ghost, Timer } from 'lucide-react';
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
import { decodeCard, encodePayload } from '../lib/cardCodec';
import { QRCodeSVG } from 'qrcode.react';
import garageShopAsset from '@/assets/garage-shop.png.asset.json';
import { DEFAULT_BIKE_PLACEMENT } from '@/features/garage/types';
import { fetchCardPhoto } from '../lib/cardPhoto';
import { useCollectedCards, type CollectedCard } from '../hooks/useCollectedCards';
import { useSpectreCards, type SpectreCard } from '../hooks/useSpectreCards';
import { useVehicleCards } from '../hooks/useVehicleCards';
import { VehicleCard } from './VehicleCard';
import { formatChallengeTime, formatDelta } from '../lib/challenge';

const SCANNER_ID = 'collected-cards-qr-scanner';

export function CollectedCardsFolder() {
  const { collected, addCard, rescanCard, removeCard } = useCollectedCards();
  const { spectres } = useSpectreCards();
  // The rider's own vehicle cards always lead the regular row.
  const { cards: myCards } = useVehicleCards();
  const [showScanner, setShowScanner] = useState(false);
  const [rescanKey, setRescanKey] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Repair cards saved by older builds where the payload had a photo path but
  // the first download was interrupted. The cached local image is filled in
  // automatically when the vault is opened again.
  useEffect(() => {
    let cancelled = false;
    const hydrateMissingPhotos = async () => {
      for (const card of collected) {
        if (cancelled || card.img || !card.p) continue;
        const img = await fetchCardPhoto(card.p);
        if (!cancelled && img) rescanCard(card.key, card, img);
      }
    };
    void hydrateMissingPhotos();
    return () => {
      cancelled = true;
    };
  }, [collected, rescanCard]);

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
          void stopScanner();
          void (async () => {
            const img = payload.p ? await fetchCardPhoto(payload.p) : null;
            if (payload.p && !img) {
              toast.info('Bike photo unavailable — ask them to reopen their card, then rescan');
            } else if (!payload.p) {
              toast.info('This card was shared without a bike photo');
            }

            if (keyToRescan !== null) {
              rescanCard(keyToRescan, payload, img ?? undefined);
              toast.success(`${payload.n} updated`);
            } else {
              const { added } = addCard(payload, img ?? undefined);
              if (added) {
                toast.success(`Added ${payload.n} to your collection`);
              } else {
                toast.info(`${payload.n} is already in your collection`);
              }
            }
          })();
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
      <p className="px-4 pb-3 text-[10px] text-muted-foreground">Tap a card to flip it.</p>

      {/* Spectre row — earned only by beating time attacks; no QR, no trading */}
      <CardRow
        icon={<Ghost className="w-4 h-4 text-cyan-300" />}
        title="Spectre"
        count={spectres.length}
        hint="Earned by beating time attacks"
        empty="Take a card's time attack on the map and beat it. Spectre cards can't be scanned or traded."
        emptyClass="border-cyan-300/30"
      >
        {spectres.map((sp) => (
          <div key={sp.key} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <FlipCard
              card={{ ...sp.card, key: sp.key, img: sp.img, collectedAt: sp.earnedAt }}
              spectre={sp}
            />
          </div>
        ))}
      </CardRow>

      {/* Collected row — scanned from other riders; flips to its QR to pass on */}
      <CardRow
        icon={<Sparkles className="w-4 h-4 text-accent" />}
        title="Collected"
        count={myCards.length + collected.length}
        hint="Yours first, then scanned"
        empty="Scan another rider's card QR to start your collection."
        emptyClass="border-border"
      >
        {myCards.map((c) => (
          <div key={`own-${c.bike.id}`} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <VehicleCard card={c} />
            <p className="mt-2 py-2 text-center text-xs font-medium text-accent">Your card</p>
          </div>
        ))}
        {collected.map((card) => (
          <div key={card.key} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <FlipCard card={card} />
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => startScanner(card.key)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary/60 text-foreground hover:bg-secondary transition-colors text-xs font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Rescan
              </button>
              <button
                type="button"
                onClick={() => {
                  removeCard(card.key);
                  toast.success('Removed from collection');
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          </div>
        ))}
      </CardRow>

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


function CardRow({
  icon,
  title,
  count,
  hint,
  empty,
  emptyClass,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  hint: string;
  empty: string;
  emptyClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 pb-5">
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {count === 0 ? (
        <div className={cn('rounded-2xl border border-dashed px-4 py-6 text-center', emptyClass)}>
          <p className="text-xs text-muted-foreground/70">{empty}</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      )}
    </div>
  );
}

/** Tap to flip. Collected cards show their QR on the back; Spectre cards show the win. */
function FlipCard({ card, spectre }: { card: CollectedCard; spectre?: SpectreCard }) {
  const [flipped, setFlipped] = useState(false);
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  return (
    <button
      type="button"
      onClick={() => {
        haptics.light();
        setFlipped((f) => !f);
      }}
      aria-label={flipped ? `Show front of ${card.n}` : spectre ? `Show ${card.n} Spectre result` : `Show ${card.n} QR code`}
      className="block w-full aspect-[5/7] [perspective:1200px] text-left"
    >
      <div
        className={cn(
          'relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]',
          flipped && '[transform:rotateY(180deg)]',
        )}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <FullCard card={card} spectre={spectre} />
        </div>
        <div
          className={cn(
            'absolute inset-0 rounded-2xl border-2 overflow-hidden shadow-xl flex flex-col items-center p-3.5 gap-2.5 [backface-visibility:hidden] [transform:rotateY(180deg)]',
            spectre ? 'spectre-card' : cn(style.bg, style.border),
          )}
        >
          <div className="w-full min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/60 truncate">{card.o ?? 'Anonymous rider'}</p>
            <h3 className="text-sm font-bold leading-tight text-white truncate">{card.n}</h3>
          </div>
          {spectre ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-white/10 text-slate-100 border border-white/30 spectre-text">
                <Ghost className="w-3.5 h-3.5" /> Spectre
              </span>
              <div className="w-full grid grid-cols-2 gap-1.5">
                <Stat icon={Timer} label="Your time" value={formatChallengeTime(spectre.timeSec)} unit="" />
                <Stat icon={Timer} label={`${spectre.setterName}'s`} value={formatChallengeTime(spectre.targetSec)} unit="" />
              </div>
              <div className="w-full rounded-lg bg-white/5 border border-white/20 backdrop-blur-sm px-2 py-2 text-center">
                <p className="text-[8px] uppercase tracking-widest text-slate-200/70">Beaten by</p>
                <p className="font-mono text-xl font-bold text-slate-50 spectre-text">{formatDelta(spectre.timeSec, spectre.targetSec)}</p>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/40 text-center">Earned, not traded · no QR</p>
            </div>
          ) : (
            <>
              <div className="flex-1 flex items-center justify-center w-full">
                <div className="bg-white p-2 rounded-xl shadow-inner">
                  <QRCodeSVG value={encodePayload(card)} size={168} level="L" marginSize={1} />
                </div>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/60 text-center">
                Scan in Blacktop World
                <br />
                to add to a collection
              </p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function FullCard({ card, spectre }: { card: CollectedCard; spectre?: SpectreCard }) {
  const { settings } = useSettings();
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  return (
    <div
      className={cn(
        'relative w-full aspect-[5/7] rounded-2xl border-2 overflow-hidden shadow-xl flex flex-col p-3.5 gap-2.5',
        // Spectre: the same card as a translucent ghost in drifting fog.
        spectre ? 'spectre-card' : cn(style.bg, style.border),
      )}
    >
      {spectre && (
        <>
          <div className="spectre-metal" />
          <div className="spectre-fog" />
          <div className="spectre-fog alt" />
          <div className="spectre-shimmer" />
        </>
      )}
      {!spectre && style.shine && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 animate-card-shine" />
        </div>
      )}
      {!spectre && style.sparkle && (
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

      <div className="relative rounded-xl overflow-hidden aspect-[4/3] border border-white/10 mt-1">
        <div
          className={cn("absolute inset-0 bg-cover bg-center origin-center", spectre && "grayscale opacity-60")}
          style={{
            backgroundImage: `url(${garageShopAsset.url})`,
            transform: `scale(${card.z ?? 1})`,
          }}
        >
          <div className="absolute inset-0 bg-black/20" />
          {card.img ? (() => {
            const placement = card.pl ?? DEFAULT_BIKE_PLACEMENT;
            return (
              <img
                src={card.img}
                alt={card.n}
                className={cn("absolute object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]", spectre && "spectre-photo")}
                style={{
                  left: `${placement.xPct}%`,
                  bottom: `${placement.yPct}%`,
                  height: `${placement.scalePct}%`,
                  maxWidth: '90%',
                  transform: 'translateX(-50%)',
                  imageRendering: 'pixelated',
                }}
              />
            );
          })() : (
            <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
              No photo
            </div>
          )}
        </div>
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
