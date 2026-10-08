import { useDemoLocked } from '@/components/DemoLock';
import { demoBlocked } from '@/lib/demoGuard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Html5Qrcode } from 'html5-qrcode';
import { loadQrScanner } from '@/lib/qrScanner';
import { toast } from 'sonner';
import { Folder, ArrowLeft, ScanLine, Gauge, Route, Clock, Hash, Sparkles, Trash2, RefreshCw, Ghost, Timer, Sticker as StickerIcon, Scan, Check, ArrowUp, ArrowDown, LayoutGrid, Lock, Swords } from 'lucide-react';
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
import { BattleCard, VaultTags, useBattleCards, useRedlineCards, type VaultBattleCard } from '@/features/card-wars/collection';
import { CardLift } from './CardLift';
import { TierFx } from '@/components/TierFx';
import { VaultCarousel } from './VaultCarousel';
import { StickerControl, StickerPreview, removeStickerFor, setArranging, useStickers } from '@/features/stickers';
import { useNavigate } from 'react-router-dom';
import { useCardArt } from '@/hooks/useCardArt';

const SCANNER_ID = 'collected-cards-qr-scanner';

export function CollectedCardsFolder({ spectreBack }: { spectreBack?: SpectreBack } = {}) {
  const locked = useDemoLocked();
  const { collected, addCard, rescanCard, removeCard } = useCollectedCards();
  const { spectres, assignPower } = useSpectreCards();
  const battle = useBattleCards();
  const redline = useRedlineCards();
  /** The card lifted out of its place (by key), and the place it left. */
  const [lift, setLift] = useState<{ key: string; source: HTMLElement | null } | null>(null);
  const [showIndex, setShowIndex] = useState(false);
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

  // Every card in the vault as one kind of thing: how it draws (both faces), its thumb in the full list, and what sits under it when lifted.
  const actions = 'flex-1 inline-flex items-center justify-center gap-1.5 min-h-12 rounded-xl text-xs font-medium transition-colors';
  const scanned: Entry[] = [
    ...myCards.map((c): Entry => ({
      key: `own:${c.bike.id}`,
      title: c.bike.name,
      card: (turn, onTap, up) => <OwnFlipCard card={c} turn={turn} onTap={onTap} edit={up} />,
      thumb: (onTap) => <MiniCard img={c.bike.photos.hero || undefined} name={c.bike.name} tier={c.tier} onClick={onTap} />,
      caption: <p className="mt-2 py-1 text-center text-xs font-medium text-accent">{tr("Your card")}</p>,
      below: <p className="text-center text-xs text-white/70">{tr("Your card")}</p>,
    })),
    ...collected.map((card): Entry => ({
      key: `card:${card.key}`,
      title: card.n,
      card: (turn, onTap) => <FlipCard card={card} turn={turn} onTap={onTap} />,
      thumb: (onTap) => <MiniCard img={card.img} name={card.n} tier={card.t} onClick={onTap} />,
      below: (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => startScanner(card.key)} disabled={locked} className={cn(actions, 'disabled:opacity-40 disabled:pointer-events-none bg-secondary text-foreground')}>
            <RefreshCw className="w-3.5 h-3.5" /> {tr("Rescan")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLift(null);
              removeCard(card.key);
              removeStickerFor(`card:${card.key}`);
              toast.success(tr("Removed from collection"));
            }}
            className={cn(actions, 'bg-destructive/25 text-destructive')}
          >
            <Trash2 className="w-3.5 h-3.5" /> {tr("Remove")}
          </button>
        </div>
      ),
    })),
  ];
  const battleEntry = (card: VaultBattleCard, held: boolean): Entry => ({
    key: `cw:${card.id}`,
    title: card.name,
    locked: !held,
    card: (turn, onTap) =>
      held ? (
        <WonFlipCard card={card} turn={turn} onTap={onTap} />
      ) : (
        <div className="vault-locked">
          <BattleCard card={card} badge={<LockedBadge />} />
        </div>
      ),
    thumb: (onTap) => <BattleCard card={card} size="thumb" onClick={onTap} className={held ? undefined : 'vault-locked'} />,
    below: <VaultTags card={card} />,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const battleAll = useMemo(() => battle.all.map((c) => battleEntry(c, battle.has(c.id))), [battle]);
  const battleHeld = battleAll.filter((e) => !e.locked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const redlineAll = useMemo(() => redline.all.map((c) => battleEntry(c, redline.has(c.id))), [redline]);
  const redlineHeld = redlineAll.filter((e) => !e.locked);
  const spectreEntries: Entry[] = spectres.map((sp) => {
    const card = { ...sp.card, key: sp.key, img: sp.img, collectedAt: sp.earnedAt };
    return {
      key: `spectre:${sp.key}`,
      title: sp.card.n,
      card: (turn, onTap) => (
        <FlipCard card={card} stickerKey={`spectre:${sp.key}`} spectre={sp} spectreBack={spectreBack ? (shown) => spectreBack(sp, shown, (power) => assignPower(sp.key, power)) : undefined} turn={turn} onTap={onTap} />
      ),
      thumb: (onTap) => <MiniCard img={sp.img} name={sp.card.n} tier={sp.card.t} spectre onClick={onTap} />,
    };
  });
  const heldCount = scanned.length + battleHeld.length + redlineHeld.length + spectreEntries.length;
  const totalCount = scanned.length + battleAll.length + redlineAll.length + spectreEntries.length;
  const lifted = lift ? [...scanned, ...battleAll, ...redlineAll, ...spectreEntries].find((e) => e.key === lift.key) ?? null : null;
  const open = (entry: Entry, source: HTMLElement | null) => {
    haptics.light();
    setLift({ key: entry.key, source });
  };

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


      <button
        type="button"
        onClick={() => {
          haptics.light();
          setShowIndex(true);
        }}
        className="frost-accent mx-4 mb-4 w-[calc(100%-2rem)] min-h-12 px-4 rounded-xl border flex items-center gap-2 text-sm font-semibold"
      >
        <LayoutGrid className="w-4 h-4 text-accent" />
        {tr("Full vault")}
        <span className="ml-auto text-xs font-mono font-normal text-muted-foreground">{tr("{0} of {1} collected", [heldCount, totalCount])}</span>
      </button>

      {/* Scanned: the rider's own cards first, then the ones scanned from other riders */}
      <CardRow icon={<Sparkles className="w-4 h-4 text-accent" />} title={tr("Scanned cards")} entries={scanned} hint={tr("Yours first, then scanned")} empty={tr("Scan another rider's card QR to start your collection.")} lifted={lift?.key} onOpen={open} />

      {/* Battle cards: every catalogue card the account holds */}
      <CardRow icon={<Swords className="w-4 h-4 text-accent" />} title={tr("Battle cards")} entries={battleHeld} hint={tr("Card Wars")} empty={tr("No battle cards yet")} lifted={lift?.key} onOpen={open} />

      {/* Redline cards and Spectres: only there once one is held */}
      {redlineHeld.length > 0 && <CardRow icon={<Gauge className="w-4 h-4 text-destructive" />} title={tr("Redline cards")} entries={redlineHeld} hint={tr("Redline")} lifted={lift?.key} onOpen={open} />}
      {spectreEntries.length > 0 && (
        <CardRow icon={<Ghost className="w-4 h-4 text-cyan-300" />} title={tr("Dog tags")} entries={spectreEntries} hint={tr("Dog tags from Track Day leaderboards")} lifted={lift?.key} onOpen={open} />
      )}

      {/* The full vault: every card there is, five across, the ones not held greyed. Portaled like the scanner (the World page is a transform context). */}
      {showIndex &&
        createPortal(
          <div className="fixed inset-0 z-[9990] bg-background flex flex-col overflow-hidden safe-frame-x" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3">
              <button onClick={() => setShowIndex(false)} className="p-2.5 rounded-xl bg-secondary hover:bg-muted transition-colors glove-hit" aria-label={tr("Back")}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-semibold">{tr("Full vault")}</h2>
              <span className="ml-auto text-xs font-mono text-muted-foreground">{tr("{0} of {1} collected", [heldCount, totalCount])}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5" data-no-pull>
              <IndexSection title={tr("Scanned cards")} count={String(scanned.length)} entries={scanned} empty={tr("Scan another rider's card QR to start your collection.")} lifted={lift?.key} onOpen={open} />
              <IndexSection title={tr("Battle cards")} count={tr("{0} of {1} collected", [battleHeld.length, battleAll.length])} entries={battleAll} lifted={lift?.key} onOpen={open} />
              <IndexSection title={tr("Redline cards")} count={tr("{0} of {1} collected", [redlineHeld.length, redlineAll.length])} entries={redlineAll} lifted={lift?.key} onOpen={open} />
              {spectreEntries.length > 0 && <IndexSection title={tr("Dog tags")} count={String(spectreEntries.length)} entries={spectreEntries} lifted={lift?.key} onOpen={open} />}
            </div>
          </div>,
          document.body,
        )}

      {lifted && (
        <CardLift
          key={lifted.key}
          source={lift!.source}
          locked={lifted.locked}
          title={lifted.title}
          render={(turn, onTap) => lifted.card(turn, onTap, true)}
          below={lifted.below}
          onClosed={() => setLift(null)}
        />
      )}

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


/** One card of the vault, however it's shown. */
interface Entry {
  key: string;
  title: string;
  /** Not held yet: greyed, and it comes forward without turning over. */
  locked?: boolean;
  /** The card with both its faces, turned `turn` degrees. `up`: it's the lifted one (the rider's own card takes its controls there). */
  card: (turn: number, onTap: () => void, up: boolean) => React.ReactNode;
  /** Its thumb in the full list. */
  thumb: (onTap: () => void) => React.ReactNode;
  /** Under it in its row, and under it once lifted. */
  caption?: React.ReactNode;
  below?: React.ReactNode;
}

/** A card's place in a list. It keeps the place (unseen) while the card is lifted out of it, and is what the card flies back to. */
function Slot({ entry, thumb, gone, onOpen, className }: { entry: Entry; thumb?: boolean; gone: boolean; onOpen: (entry: Entry, source: HTMLElement | null) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tap = () => onOpen(entry, ref.current);
  return (
    <div className={className}>
      <div ref={ref} className={cn(gone && 'invisible')}>
        {thumb ? entry.thumb(tap) : entry.card(0, tap, false)}
      </div>
      {!thumb && entry.caption}
    </div>
  );
}

/** A row of the vault: it crawls on its own once it has more than one card, and the rider's finger sets its pace (`VaultCarousel`). */
function CardRow({
  icon,
  title,
  entries,
  hint,
  empty,
  lifted,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  entries: Entry[];
  hint: string;
  /** What to say when there's nothing in it (rows that hide when empty have none). */
  empty?: string;
  /** The card that's lifted out, if one is: every row comes to a stop. */
  lifted?: string;
  onOpen: (entry: Entry, source: HTMLElement | null) => void;
}) {
  return (
    <div className="px-4 pb-5">
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground/70">{empty}</p>
        </div>
      ) : (
        <VaultCarousel count={entries.length} paused={!!lifted}>
          {entries.map((e) => (
            <Slot key={e.key} entry={e} gone={lifted === e.key} onOpen={onOpen} className="flex-shrink-0 w-[62%] max-w-[240px]" />
          ))}
        </VaultCarousel>
      )}
    </div>
  );
}

/** A section of the full vault: its cards five across, as small as a hand in a battle. */
function IndexSection({ title, count, entries, empty, lifted, onOpen }: { title: string; count: string; entries: Entry[]; empty?: string; lifted?: string; onOpen: (entry: Entry, source: HTMLElement | null) => void }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 pb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
        <span className="ml-auto text-[11px] font-mono text-muted-foreground">{count}</span>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground/70">{empty}</p>
      ) : (
        <div className="vault-grid">
          {entries.map((e) => (
            <Slot key={e.key} entry={e} thumb gone={lifted === e.key} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function LockedBadge() {
  return (
    <span className="inline-flex items-center gap-1">
      <Lock className="w-2.5 h-2.5" aria-hidden />
      {tr("Locked")}
    </span>
  );
}

/** A rider's card (their own, a scanned one, a Spectre) at the size of the full list: its picture in the garage and its name. */
function MiniCard({ img, name, tier, spectre, onClick }: { img?: string; name: string; tier: CollectedCard['t']; spectre?: boolean; onClick: () => void }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.bronze;
  const art = useCardArt(img);
  return (
    <button type="button" onClick={onClick} aria-label={name} className={cn('relative isolate block w-full rounded-lg border overflow-hidden text-left', spectre ? 'spectre-card-back border-white/30' : cn(style.bg, style.border))}>
      <TierFx tier={spectre ? 'spectre' : tier} still />
      <span className="relative block aspect-[5/4] bg-cover bg-center" style={{ backgroundImage: `url(${garageShopAsset.url})` }}>
        {art && <img src={art} alt="" className="absolute inset-0 w-full h-full object-contain p-0.5" draggable={false} />}
      </span>
      <span className="block px-1 py-0.5 text-[8px] font-semibold leading-tight truncate text-white">{name}</span>
    </button>
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
function OwnFlipCard({ card, turn, onTap, edit }: { card: VehicleCardData; turn?: number; onTap?: () => void; /** Lifted out of its row: the card image button is offered. */ edit?: boolean }) {
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
  return <FlipCard card={{ ...payload, key: `own-${card.bike.id}`, img: hero || undefined, collectedAt: 0 }} image={hero && (edit || turn === undefined) ? image : undefined} trend={card.trend} turn={turn} onTap={onTap} />;
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
function FlipCard({ card, spectre, spectreBack, stickerKey = `card:${card.key}`, image, trend, turn, onTap }: { card: CollectedCard; spectre?: SpectreCard; spectreBack?: (shown: boolean) => React.ReactNode; /** The card's sticker (`features/stickers`), offered under the QR or the dog tag. */ stickerKey?: string; /** The rider's own card only: lets them frame its picture. */ image?: ImageEdit; /** The rider's own card only: which figures have gone up or down since its last tier. */ trend?: CardTrend; /** Turned from outside (the vault): degrees, and what a tap does. Left out, the card turns itself over when tapped. */ turn?: number; onTap?: () => void }) {
  // The sticker is always cut from the photo itself; it's drawn in the pixel-art look where it's shown, so the switch works both ways.
  const sticker = <StickerControl card={stickerKey} name={card.n} src={card.img} className="shrink-0" />;
  const [own, setOwn] = useState(false);
  const [framing, setFraming] = useState(false);
  const style = TIER_STYLES[card.t] ?? TIER_STYLES.bronze;
  const led = turn !== undefined;
  // Every half turn shows the other face.
  const flipped = led ? Math.round(turn / 180) % 2 === 1 : own;
  const flip = () => {
    // Not while the picture is being framed: a drag ending on the card would turn it over.
    if (framing) return;
    if (led) return onTap?.();
    haptics.light();
    setOwn((f) => !f);
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
          !led && flipped && '[transform:rotateY(180deg)]',
        )}
        style={led ? { transform: `rotateY(${turn}deg)`, transitionDuration: '900ms', transitionTimingFunction: 'cubic-bezier(0.3, 0.7, 0.2, 1)' } : undefined}
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
function WonFlipCard({ card, turn, onTap }: { card: VaultBattleCard; turn?: number; onTap?: () => void }) {
  const [own, setOwn] = useState(false);
  const led = turn !== undefined;
  const flipped = led ? Math.round(turn / 180) % 2 === 1 : own;
  return (
    <button
      type="button"
      onClick={() => {
        if (led) return onTap?.();
        haptics.light();
        setOwn((f) => !f);
      }}
      aria-label={flipped ? tr("Show front of {0}", [card.name]) : tr("Show {0} sticker", [card.name])}
      data-tip="vault-card"
      className="block w-full [perspective:1200px] text-left"
    >
      <div
        className={cn('relative w-full transition-transform duration-700 [transform-style:preserve-3d]', !led && flipped && '[transform:rotateY(180deg)]')}
        style={led ? { transform: `rotateY(${turn}deg)`, transitionDuration: '900ms', transitionTimingFunction: 'cubic-bezier(0.3, 0.7, 0.2, 1)' } : undefined}
      >
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
  const art = useCardArt(card.img);
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
        'relative isolate w-full aspect-[5/7] rounded-2xl border-2 overflow-hidden shadow-xl flex flex-col p-3.5 gap-2.5',
        // Spectre: the same card as a translucent ghost in drifting fog.
        spectre ? 'spectre-card' : cn(style.bg, style.border),
      )}
    >
      {/* The tier's finish (metal, stone, glass, swirl, night sky), or a Spectre's fog */}
      <TierFx tier={spectre ? 'spectre' : card.t} seed={card.key} />
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
                src={art}
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
