import { useDemoLocked } from '@/components/DemoLock';
import { demoBlocked } from '@/lib/demoGuard';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Html5Qrcode } from 'html5-qrcode';
import { loadQrScanner } from '@/lib/qrScanner';
import { toast } from 'sonner';
import { Folder, ArrowLeft, ScanLine, Gauge, Route, Clock, Hash, Sparkles, Trash2, RefreshCw, Ghost, Timer, Sticker as StickerIcon, Scan, Check, ArrowUp, ArrowDown } from 'lucide-react';
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
import { fetchCardPhoto, uploadCardPhoto } from '../lib/cardPhoto';
import { encodeCard } from '../lib/cardCodec';
import { useProfile } from '@/features/profile';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { VehicleCardData, CardTrend, Trend } from '../hooks/useVehicleCards';
import { useCollectedCards, type CollectedCard } from '../hooks/useCollectedCards';
import { useSpectreCards, type SpectreCard } from '../hooks/useSpectreCards';
import { useVehicleCards } from '../hooks/useVehicleCards';
import { formatSpectreTime as formatChallengeTime, formatSpectreGap as formatDelta } from '../lib/spectre';
import { tr } from '@/lib/i18n';

import { PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';
import { BattleCard, useWonBattleCards } from '@/features/card-wars/collection';
import { StickerControl, StickerPreview, removeStickerFor, setArranging, useStickers } from '@/features/stickers';
import { useNavigate } from 'react-router-dom';

const SCANNER_ID = 'collected-cards-qr-scanner';

export function CollectedCardsFolder({ spectreBack }: { spectreBack?: SpectreBack } = {}) {
  const locked = useDemoLocked();
  const { collected, addCard, rescanCard, removeCard } = useCollectedCards();
  const { spectres, assignPower } = useSpectreCards();
  const wonCards = useWonBattleCards();
  const stickers = useStickers();
  const navigate = useNavigate();
  // The rider's own vehicle cards always lead the regular row.
  const { cards: myCards, markTierSeen } = useVehicleCards();
  // A card that has moved up a tier since it was last looked at: once it's been seen here, its arrows start again from today's figures.
  useEffect(() => {
    const fresh = myCards.filter((c) => c.isNewTier);
    if (!fresh.length) return;
    const t = window.setTimeout(() => fresh.forEach((c) => markTierSeen(c.bike.id)), 8000);
    return () => window.clearTimeout(t);
  }, [myCards, markTierSeen]);
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
    if (scannerRef.current || showScanner || demoBlocked()) return;
    haptics.light();
    setRescanKey(keyToRescan);
    setShowScanner(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const qr = new (await loadQrScanner())(SCANNER_ID);
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
              toast.info(tr("Bike photo unavailable — ask them to reopen their card, then rescan"));
            } else if (!payload.p) {
              toast.info(tr("This card was shared without a bike photo"));
            }

            if (keyToRescan !== null) {
              rescanCard(keyToRescan, payload, img ?? undefined);
              toast.success(tr("{0} updated", [payload.n]));
            } else {
              const { added } = addCard(payload, img ?? undefined);
              if (added) {
                toast.success(tr("Added {0} to your collection", [payload.n]));
              } else {
                toast.info(tr("{0} is already in your collection", [payload.n]));
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
      toast.error(tr("Could not access camera"), {
        description: err instanceof DOMException && err.name === 'NotAllowedError'
          ? tr("Camera permission was denied")
          : tr("Close other camera views and try again"),
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
        <h2 className="text-sm font-semibold tracking-tight">{tr("Card Collection")}</h2>
        {stickers.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setArranging(true);
              navigate('/');
            }}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/60 text-foreground hover:bg-secondary transition-colors text-xs font-medium"
          >
            <StickerIcon className="w-3.5 h-3.5 text-accent" />
            {tr("Arrange stickers")}
          </button>
        )}
        <button
          type="button"
          onClick={() => startScanner(null)}
          disabled={locked}
          className="disabled:opacity-40 disabled:pointer-events-none [&:nth-child(3)]:ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors text-xs font-medium"
          aria-label={tr("Scan a card")}
          data-tip="scan-card"
        >
          <ScanLine className="w-3.5 h-3.5" />
          {tr("Scan card")}
        </button>
      </div>
      <p className="px-4 pb-3 text-[10px] text-muted-foreground">{tr("Tap a card to flip it. Every card has a sticker on its back for your Home screen.")}</p>

      {/* Collected row — scanned from other riders; flips to its QR to pass on */}
      <CardRow
        icon={<Sparkles className="w-4 h-4 text-accent" />}
        title={tr("Scanned cards")}
        count={myCards.length + collected.length}
        hint={tr("Yours first, then scanned")}
        empty={tr("Scan another rider's card QR to start your collection.")}
        emptyClass="border-border"
      >
        {myCards.map((c) => (
          <div key={`own-${c.bike.id}`} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <OwnFlipCard card={c} />
            <p className="mt-2 py-2 text-center text-xs font-medium text-accent">{tr("Your card")}</p>
          </div>
        ))}
        {collected.map((card) => (
          <div key={card.key} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <FlipCard card={card} />
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => startScanner(card.key)}
                disabled={locked}
                className="disabled:opacity-40 disabled:pointer-events-none flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary/60 text-foreground hover:bg-secondary transition-colors text-xs font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />{" "}{tr("Rescan")}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeCard(card.key);
                  removeStickerFor(`card:${card.key}`);
                  toast.success(tr("Removed from collection"));
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />{" "}{tr("Remove")}
              </button>
            </div>
          </div>
        ))}
      </CardRow>

      <CardRow
        icon={<Sparkles className="w-4 h-4 text-accent" />}
        title={tr("Won cards")}
        count={wonCards.length}
        hint={tr("Battle cards")}
        empty={tr("No won cards yet")}
        emptyClass="border-border"
      >
        {wonCards.map(card => (
          <div key={card.id} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <WonFlipCard card={card} />
          </div>
        ))}
      </CardRow>

      {/* Spectre row — dog tags, earned only by beating a lap on a Track Day board; no QR, no trading */}
      <CardRow
        icon={<Ghost className="w-4 h-4 text-cyan-300" />}
        title={tr("Dog tags")}
        count={spectres.length}
        hint={tr("Dog tags from Track Day leaderboards")}
        empty={tr("Beat a rider's lap on a Track Day leaderboard to take their dog tag. Spectre cards can't be scanned or traded.")}
        emptyClass="border-cyan-300/30"
      >
        {spectres.map((sp) => (
          <div key={sp.key} className="snap-start flex-shrink-0 w-[62%] max-w-[240px]">
            <FlipCard
              card={{ ...sp.card, key: sp.key, img: sp.img, collectedAt: sp.earnedAt }}
              stickerKey={`spectre:${sp.key}`}
              spectre={sp}
              spectreBack={spectreBack ? (shown) => spectreBack(sp, shown, (power) => assignPower(sp.key, power)) : undefined}
            />
          </div>
        ))}
      </CardRow>

      {/* Scanner portal — rendered at document.body to escape the World page's
          transform stacking context, which would otherwise make fixed positioning
          scroll with the page instead of anchoring to the viewport. */}
      {showScanner && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-hidden safe-frame-x" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3">
            <button
              onClick={stopScanner}
              className="p-2.5 rounded-xl bg-secondary hover:bg-muted transition-colors"
              aria-label={tr("Back")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold">
              {rescanKey ? tr("Rescan Card") : tr("Scan Card QR")}
            </h2>
          </div>

          <div className="flex-1 overflow-hidden">
            <div id={SCANNER_ID} className="w-full h-full" />
          </div>

          <p className="flex-shrink-0 text-center text-muted-foreground text-xs px-6 py-3">
            {rescanKey
              ? tr("Point at the rider's updated QR to refresh their card")
              : tr("Point your camera at a rider's card QR")}
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

/** How the rider frames the picture on their own card: the zoom travels with the card, the position stays on this phone. */
interface ImageEdit {
  zoom: number;
  pan: { x: number; y: number };
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
}

/**
 * The rider's own card in the vault: the same tap-to-flip card as the rest,
 * plus the card image button (drag and zoom the picture). Only here: a copy
 * someone scanned, and the card in the Speed Shop, never carry it.
 */
function OwnFlipCard({ card }: { card: VehicleCardData }) {
  const { profile } = useProfile();
  const [zooms, setZooms] = useLocalStorage<Record<string, number>>('bt.cards.zoom.v1', {});
  const [pans, setPans] = useLocalStorage<Record<string, { x: number; y: number }>>('bt.cards.pan.v1', {});
  const id = card.bike.id;
  const image: ImageEdit = {
    zoom: zooms[id] ?? 1,
    pan: pans[id] ?? { x: 0, y: 0 },
    setZoom: (zoom) => setZooms((prev) => ({ ...prev, [id]: zoom })),
    setPan: (pan) => setPans((prev) => ({ ...prev, [id]: pan })),
  };
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const hero = card.bike.photos.hero;
  const uid = card.bike.id.replace(/-/g, '');
  useEffect(() => {
    if (!hero) return;
    let cancelled = false;
    void uploadCardPhoto(uid, hero).then((p) => { if (!cancelled && p) setPhotoPath(p); });
    return () => { cancelled = true; };
  }, [hero, uid]);
  const payload = decodeCard(encodeCard(card, profile.name, photoPath ?? undefined, zooms[card.bike.id] ?? 1));
  if (!payload) return null;
  return <FlipCard card={{ ...payload, key: `own-${card.bike.id}`, img: hero || undefined, collectedAt: 0 }} image={hero ? image : undefined} trend={card.trend} />;
}

/** What a Spectre's back shows (its Card Wars dog tag): drawn by whoever hosts the vault, so cards don't depend on Card Wars. */
export type SpectreBack = (spectre: SpectreCard, shown: boolean, assign: (power: NonNullable<SpectreCard['power']>) => void) => React.ReactNode;

/** A Spectre's front, under the photo: where it was won, both times and the gap. */
function SpectreResult({ spectre }: { spectre: SpectreCard }) {
  return (
    <div className="relative mt-auto space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-200/80 text-center truncate">{spectre.track ?? tr("Road challenge")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat icon={Timer} label={tr("{0}'s", [spectre.setterName])} value={formatChallengeTime(spectre.targetSec)} unit="" />
        <Stat icon={Timer} label={tr("Your time")} value={formatChallengeTime(spectre.timeSec)} unit="" />
      </div>
      <div className="rounded-lg bg-white/5 border border-white/20 backdrop-blur-sm px-2 py-1 text-center">
        <p className="text-[8px] uppercase tracking-widest text-slate-200/70">{tr("Beaten by")}</p>
        <p className="font-mono text-base font-bold text-slate-50 leading-tight spectre-text">{formatDelta(spectre.timeSec, spectre.targetSec)}</p>
      </div>
    </div>
  );
}

/** Tap to flip. Collected cards show their QR on the back; Spectre cards their dog tag (the win, where nothing draws the tag). */
function FlipCard({ card, spectre, spectreBack, stickerKey = `card:${card.key}`, image, trend }: { card: CollectedCard; spectre?: SpectreCard; spectreBack?: (shown: boolean) => React.ReactNode; /** The card's sticker (`features/stickers`), offered under the QR or the dog tag. */ stickerKey?: string; /** The rider's own card only: lets them frame its picture. */ image?: ImageEdit; /** The rider's own card only: which figures have gone up or down since its last tier. */ trend?: CardTrend }) {
  const sticker = <StickerControl card={stickerKey} name={card.n} src={card.img} className="shrink-0" />;
  const [flipped, setFlipped] = useState(false);
  const [framing, setFraming] = useState(false);
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  const flip = () => {
    // Not while the picture is being framed: a drag ending on the card would turn it over.
    if (framing) return;
    haptics.light();
    setFlipped((f) => !f);
  };
  // A card with controls on it can't be a <button> (no buttons or sliders inside one): it's a div that acts as one.
  const Root = image ? 'div' : 'button';
  return (
    <Root
      {...(image
        ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flip(); } } }
        : { type: 'button' as const })}
      onClick={flip}
      aria-label={flipped ? tr("Show front of {0}", [card.n]) : spectre ? (spectreBack ? tr("Show {0} dog tag", [card.n]) : tr("Show {0} Spectre result", [card.n])) : tr("Show {0} QR code", [card.n])}
      data-tip="vault-card"
      className="block w-full aspect-[5/7] [perspective:1200px] text-left cursor-pointer"
    >
      <div
        className={cn(
          'relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]',
          flipped && '[transform:rotateY(180deg)]',
        )}
      >
        <div className="absolute inset-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(0deg)_translateZ(1px)]">
          <FullCard card={card} spectre={spectre} stats={spectre && spectreBack ? <SpectreResult spectre={spectre} /> : undefined} image={image && !flipped ? { ...image, framing, setFraming } : undefined} trend={trend} />
        </div>
        <div
          className={cn(
            'absolute inset-0 rounded-2xl border-2 overflow-hidden shadow-xl flex flex-col items-center p-3.5 gap-2.5 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(1px)]',
            spectre ? 'spectre-card-back' : cn(style.bg, style.border),
          )}
        >
          <div className="w-full min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/60 truncate">{card.o ?? tr("Anonymous rider")}</p>
            <h3 className="text-sm font-bold leading-tight text-white truncate">{card.n}</h3>
          </div>
          {spectre && spectreBack ? (
            <>
              {spectreBack(flipped)}
              {sticker}
            </>
          ) : spectre ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-white/10 text-slate-100 border border-white/30 spectre-text">
                <Ghost className="w-3.5 h-3.5" />{" "}{tr("Spectre")}
              </span>
              {spectre.track && <p className="text-[10px] uppercase tracking-widest text-slate-200/80 text-center truncate w-full">{spectre.track}</p>}
              <div className="w-full grid grid-cols-2 gap-1.5">
                <Stat icon={Timer} label={tr("Your time")} value={formatChallengeTime(spectre.timeSec)} unit="" />
                <Stat icon={Timer} label={tr("{0}'s", [spectre.setterName])} value={formatChallengeTime(spectre.targetSec)} unit="" />
              </div>
              <div className="w-full rounded-lg bg-white/5 border border-white/20 backdrop-blur-sm px-2 py-2 text-center">
                <p className="text-[8px] uppercase tracking-widest text-slate-200/70">{tr("Beaten by")}</p>
                <p className="font-mono text-xl font-bold text-slate-50 spectre-text">{formatDelta(spectre.timeSec, spectre.targetSec)}</p>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/40 text-center">{tr("Earned, not traded · no QR")}</p>
              {sticker}
            </div>
          ) : (
            <>
              {/* The QR takes whatever height the name, the caption and the sticker button leave. */}
              <div className="flex-1 min-h-0 flex items-center justify-center w-full">
                <div className="bg-white p-2 rounded-xl shadow-inner h-full max-h-[184px] aspect-square max-w-full">
                  <QRCodeSVG value={encodePayload(card)} size={168} level="L" marginSize={1} style={{ width: '100%', height: '100%' }} />
                </div>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-white/60 text-center">
                {tr("Scan in Blacktop World")}
                <br />
                {tr("to add to a collection")}
              </p>
              {sticker}
            </>
          )}
        </div>
      </div>
    </Root>
  );
}

/** A card won in Card Wars: its face, and on the back its sticker. */
function WonFlipCard({ card }: { card: ReturnType<typeof useWonBattleCards>[number] }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        haptics.light();
        setFlipped((f) => !f);
      }}
      aria-label={flipped ? tr("Show front of {0}", [card.name]) : tr("Show {0} sticker", [card.name])}
      data-tip="vault-card"
      className="block w-full [perspective:1200px] text-left"
    >
      <div className={cn('relative w-full transition-transform duration-700 [transform-style:preserve-3d]', flipped && '[transform:rotateY(180deg)]')}>
        <div className="[backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(0deg)_translateZ(1px)]">
          <BattleCard card={card} />
        </div>
        <div className="sticker-sheet absolute inset-0 rounded-2xl border-2 border-white/25 overflow-hidden shadow-xl flex flex-col items-center p-3.5 gap-2.5 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(1px)]">
          <div className="w-full min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/60">{tr("Sticker")}</p>
            <h3 className="text-sm font-bold leading-tight text-white truncate">{card.name}</h3>
          </div>
          {card.image ? (
            <>
              <div className="flex-1 min-h-0 w-full flex items-center justify-center p-3">
                <StickerPreview src={card.image} />
              </div>
              <StickerControl card={`cw:${card.id}`} name={card.name} src={card.image} className="shrink-0" />
            </>
          ) : (
            <p className="flex-1 flex items-center text-center text-[11px] text-white/60">{tr("This card's sticker isn't printed yet.")}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function FullCard({ card, spectre, stats, image, trend }: { card: CollectedCard; spectre?: SpectreCard; stats?: React.ReactNode; /** The rider's own card in the vault: the card image button and its drag-and-zoom. */ image?: ImageEdit & { framing: boolean; setFraming: (on: boolean) => void }; trend?: CardTrend }) {
  const peaksHidden = usePeaksHidden();
  const { settings } = useSettings();
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const framing = !!image?.framing;
  const zoom = image ? image.zoom : card.z ?? 1;
  const pan = image ? image.pan : { x: 0, y: 0 };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const onPanDown = (e: React.PointerEvent) => {
    if (!framing || !image) return;
    // Keep the gesture on the picture: the row of cards must not scroll with it.
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!drag.current || !frame.current || !image) return;
    e.stopPropagation();
    const rect = frame.current.getBoundingClientRect();
    const limit = 60;
    image.setPan({
      x: Math.max(-limit, Math.min(limit, drag.current.px + ((e.clientX - drag.current.x) / rect.width) * 100)),
      y: Math.max(-limit, Math.min(limit, drag.current.py + ((e.clientY - drag.current.y) / rect.height) * 100)),
    });
  };
  const onPanUp = () => {
    drag.current = null;
  };
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
            {card.o ?? tr("Anonymous rider")}
          </p>
          <h3 className="text-base font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
            {card.n}
          </h3>
          {card.m && (
            <p className="text-[10px] uppercase tracking-wider text-white/70 truncate">{card.m}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {image && (
            <button
              type="button"
              data-tip="vault-card-image"
              onClick={(e) => {
                e.stopPropagation();
                image.setFraming(!framing);
              }}
              aria-label={framing ? tr("Finish resizing image") : tr("Resize card image")}
              className="glove-hit inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/50 text-white transition-transform active:scale-90"
            >
              {framing ? <Check className="w-3 h-3" /> : <Scan className="w-3 h-3" />}
            </button>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-black/50 text-white shrink-0">
            <Sparkles className="w-2.5 h-2.5" />
            {card.tl}
          </span>
        </div>
      </div>

      <div
        ref={frame}
        className={cn('relative rounded-xl overflow-hidden aspect-[4/3] border border-white/10 mt-1', framing && 'cursor-grab active:cursor-grabbing touch-none')}
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={onPanUp}
        onPointerCancel={onPanUp}
        onClick={framing ? stop : undefined}
        onTouchStart={framing ? stop : undefined}
        onTouchMove={framing ? stop : undefined}
      >
        <div
          className={cn("absolute inset-0 bg-cover bg-center origin-center", spectre && "grayscale opacity-80")}
          style={{
            backgroundImage: `url(${garageShopAsset.url})`,
            transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})`,
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
              {tr("No photo")}
            </div>
          )}
        </div>
        {framing && image && (
          <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5 rounded-lg bg-black/80 px-2 py-1.5 border border-white/15" onPointerDown={stop} onClick={stop}>
            <span className="text-[8px] uppercase tracking-widest text-white/70 shrink-0">{tr("Drag & zoom")}</span>
            <input
              type="range"
              min={0.6}
              max={2.5}
              step={0.05}
              value={zoom}
              onChange={(e) => image.setZoom(Number(e.target.value))}
              aria-label={tr("Card image zoom")}
              className="flex-1 min-w-0 accent-[hsl(var(--accent))]"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                image.setFraming(false);
              }}
              aria-label={tr("Confirm image size")}
              className="glove-hit inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/90 text-black active:scale-90 shrink-0"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {stats ?? <div className="relative grid grid-cols-2 gap-1.5 mt-auto">
        {/* "--" when this rider hides peaks, or the card's owner kept them private (null). */}
        <Stat trend={peaksHidden ? undefined : trend?.topSpeed} icon={Gauge} label={tr("Top speed")} value={peaksHidden || card.s.topSpeedMph == null ? PEAK_HIDDEN : `${formatSpeed(card.s.topSpeedMph, settings.speedUnit)}`} unit={peaksHidden || card.s.topSpeedMph == null ? '' : getSpeedLabel(settings.speedUnit)} />
        <Stat trend={trend?.duration} icon={Clock} label={tr("Time")} value={formatDuration(card.s.totalDurationSec)} unit="" />
        <Stat trend={trend?.distance} icon={Route} label={tr("Distance")} value={formatDistance(card.s.totalDistanceMi, settings.distanceUnit)} unit={getDistanceLabel(settings.distanceUnit)} />
        <Stat trend={trend?.rides} icon={Hash} label={tr("Rides")} value={`${card.s.totalRides}`} unit="" />
      </div>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, unit, trend }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; unit: string; /** Up or down since the card's last tier: a green or red arrow, and the box glows that colour twice. */ trend?: Trend }) {
  return (
    <div className={cn('rounded-lg bg-black/35 backdrop-blur-sm border border-white/10 px-2 py-1.5', trend === 'up' && 'animate-card-stat-pulse', trend === 'down' && 'animate-card-stat-drop')}>
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest text-white/60">
        <Icon className="w-2.5 h-2.5" />
        <span className="truncate">{label}</span>
        {trend === 'up' && <ArrowUp className="w-2.5 h-2.5 text-emerald-300 ml-auto shrink-0" />}
        {trend === 'down' && <ArrowDown className="w-2.5 h-2.5 text-red-400 ml-auto shrink-0" />}
      </div>
      <p className="font-mono text-sm font-bold text-white leading-tight truncate">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-white/70">{unit}</span>}
      </p>
    </div>
  );
}
