import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsRight, QrCode, Loader2, Check, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HeaderButton } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useRideHistory, burnedAggregate, mergeAggregates, emptyAggregate } from '@/features/ride';
import { useGarage, useBikeStats, serviceStatus, type Bike } from '@/features/garage';
import { useVehicleCards } from '@/features/cards';
import { getInheritedLog, setInheritedLog, toLogRide, useInheritedLogs } from '../lib/logbookStore';
import { SCAN_WINDOW_MS, startHandover } from '../lib/transfer';
import type { LogRide, LogbookPackage } from '../types';
import { passportFor } from '../lib/passport';

const RIDES_PER_PAGE = 7;
const KM_PER_MI = 1.60934;

function fmtDate(ms: number | string) {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
}

/* ── page furniture ─────────────────────────────────────────────────────── */

function Page({ children, n, side }: { children: React.ReactNode; n: number; side: 'l' | 'r' }) {
  return (
    <div
      className={cn(
        'relative h-full flex flex-col px-2.5 pt-3 pb-5 text-[#2b2118] bg-[#f6eed9] overflow-hidden',
        '[background-image:repeating-linear-gradient(0deg,transparent_0,transparent_15px,rgba(80,60,30,0.10)_15px,rgba(80,60,30,0.10)_16px)]',
        side === 'l' ? 'rounded-l-md shadow-[inset_-10px_0_14px_-10px_rgba(0,0,0,0.35)]' : 'rounded-r-md shadow-[inset_10px_0_14px_-10px_rgba(0,0,0,0.35)]',
      )}
    >
      {children}
      <span className={cn('absolute bottom-1.5 text-[8px] font-mono text-[#2b2118]/60', side === 'l' ? 'left-2.5' : 'right-2.5')}>{n}</span>
    </div>
  );
}

function PageTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-[#2b2118]/70 pb-1 mb-1.5">{children}</p>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[9.5px] leading-[16px]">
      <span className="uppercase tracking-wider text-[#2b2118]/70 truncate">{label}</span>
      <span className="font-mono font-bold whitespace-nowrap">{value}</span>
    </div>
  );
}

/* ── the book ───────────────────────────────────────────────────────────── */

export function LogbookView({ bike, onBack }: { bike: Bike; onBack: () => void }) {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const { enabled: demoEnabled } = useDemoMode();
  const { rides, burnedTotals, detachBike } = useRideHistory();
  const { deleteBike } = useGarage();
  const stats = useBikeStats(bike);
  const { cards } = useVehicleCards();
  const logs = useInheritedLogs();
  const inherited = logs[bike.id] ?? null;
  const myName = profile.name || 'You';

  const dist = (mi: number) => `${formatDistance(mi, settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`;
  const spd = (mph: number) => `${formatSpeed(mph, settings.speedUnit)} ${getSpeedLabel(settings.speedUnit)}`;
  const kmOrMi = (km: number) =>
    settings.distanceUnit === 'km' ? `${Math.round(km).toLocaleString()} km` : `${Math.round(km / KM_PER_MI).toLocaleString()} mi`;

  const myRides = useMemo(
    () => rides.filter((r) => r.bikeId === bike.id && r.endedAt).map((r) => toLogRide(r, myName)),
    [rides, bike.id, myName],
  );
  const allRides: LogRide[] = useMemo(
    () => [...myRides, ...(inherited?.rides ?? [])].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)),
    [myRides, inherited],
  );
  const card = cards.find((c) => c.bike.id === bike.id);
  const passport = inherited?.passport ?? passportFor(bike.id);
  const owners = [...(inherited?.owners ?? []), { name: myName, from: bike.createdAt, to: 0 }];
  const challenges = allRides.filter((r) => r.challenge);
  const badgeCounts = allRides.reduce<Record<string, number>>((acc, r) => {
    (r.earnedBadges ?? []).forEach((b) => (acc[b] = (acc[b] ?? 0) + 1));
    return acc;
  }, {});
  const longest = allRides.reduce<LogRide | null>((m, r) => (!m || r.distance > m.distance ? r : m), null);
  const fastest = allRides.reduce<LogRide | null>((m, r) => (!m || r.maxSpeed > m.maxSpeed ? r : m), null);

  // ── pages ────────────────────────────────────────────────────────────────
  const pages: ((n: number, side: 'l' | 'r') => React.ReactNode)[] = [];

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <p className="text-center text-[9px] font-black uppercase tracking-[0.25em]">Vehicle Logbook</p>
      <div className="mt-2 mx-auto w-full aspect-[4/3] rounded border-2 border-[#2b2118]/70 bg-[#e6d9b8] flex items-center justify-center overflow-hidden">
        {bike.photos?.hero ? (
          <img src={bike.photos.hero} alt={bike.name} className="max-h-full max-w-full object-contain [image-rendering:pixelated]" />
        ) : (
          <span className="text-[9px] text-[#2b2118]/50">No photo</span>
        )}
      </div>
      <p className="mt-2 text-center text-[13px] font-black leading-tight truncate">{bike.name}</p>
      {bike.makeModel && <p className="text-center text-[9px] uppercase tracking-wider text-[#2b2118]/70 truncate">{bike.makeModel}</p>}
      <div className="mt-auto space-y-0.5">
        <Row label="Passport" value={passport} />
        <Row label="Keeper" value={myName} />
        <Row label="Card" value={card?.tierLabel ?? '—'} />
      </div>
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>Keepers</PageTitle>
      <div className="space-y-1.5">
        {owners.map((o, i) => (
          <div key={i} className="text-[9.5px] leading-tight">
            <p className="font-bold">
              {i + 1}. {o.name}
              {i === owners.length - 1 && <span className="ml-1 text-[8px] uppercase tracking-wider text-[#8a3b12]">current</span>}
            </p>
            <p className="font-mono text-[8.5px] text-[#2b2118]/70">
              {fmtDate(o.from)} → {o.to ? fmtDate(o.to) : 'now'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-auto text-[8.5px] italic text-[#2b2118]/60">History travels with the vehicle when it changes hands.</p>
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>Lifetime stats</PageTitle>
      <Row label="Odometer" value={kmOrMi(stats.odometerKm)} />
      <Row label="Rides" value={stats.totalRides} />
      <Row label="Distance" value={dist(stats.totalDistanceMi)} />
      <Row label="Riding time" value={formatDuration(stats.totalDurationSec)} />
      <Row label="Top speed" value={spd(stats.topSpeedMph)} />
      <Row label="Lean L / R" value={`${Math.round(stats.maxLeanLeft)}° / ${Math.round(stats.maxLeanRight)}°`} />
      <Row label="Peak G" value={stats.maxGForce > 0 ? stats.maxGForce.toFixed(2) : '—'} />
      <Row label="Longest ride" value={dist(stats.longestRideMi)} />
      <Row label="Convoy rides" value={allRides.filter((r) => r.isConvoyRide).length} />
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>Service record</PageTitle>
      {bike.maintenance.length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">No service items logged.</p>
      ) : (
        <div className="space-y-1.5">
          {bike.maintenance.map((m) => {
            const st = serviceStatus(m, stats.odometerKm);
            return (
              <div key={m.id} className="text-[9px] leading-tight">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold truncate">{m.name}</span>
                  <span
                    className={cn(
                      'px-1 rounded-sm border text-[7.5px] font-black uppercase tracking-wider rotate-[-4deg]',
                      st.tone === 'over' ? 'border-[#a3261b] text-[#a3261b]' : st.tone === 'warn' ? 'border-[#a86a12] text-[#a86a12]' : 'border-[#2f6b2f] text-[#2f6b2f]',
                    )}
                  >
                    {st.tone === 'over' ? 'Overdue' : st.tone === 'warn' ? 'Due soon' : 'OK'}
                  </span>
                </div>
                <p className="font-mono text-[8px] text-[#2b2118]/70">
                  every {kmOrMi(m.intervalKm)}
                  {m.intervalMonths ? ` / ${m.intervalMonths} mo` : ''} · last {kmOrMi(m.lastServiceKm)}
                  {m.lastServiceAt ? ` (${fmtDate(m.lastServiceAt)})` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>Highlights</PageTitle>
      <Row label="Longest" value={longest ? dist(longest.distance) : '—'} />
      {longest && <p className="text-[8px] font-mono text-[#2b2118]/60 -mt-0.5 mb-1">{fmtDate(longest.startedAt)} · {longest.owner}</p>}
      <Row label="Fastest" value={fastest ? spd(fastest.maxSpeed) : '—'} />
      {fastest && <p className="text-[8px] font-mono text-[#2b2118]/60 -mt-0.5 mb-1">{fmtDate(fastest.startedAt)} · {fastest.owner}</p>}
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider">Badges</p>
      {Object.keys(badgeCounts).length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">None yet.</p>
      ) : (
        Object.entries(badgeCounts).map(([b, c]) => <Row key={b} label={b.replace(/-/g, ' ')} value={`×${c}`} />)
      )}
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider">Time attacks</p>
      {challenges.length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">None yet.</p>
      ) : (
        challenges.slice(0, 4).map((r) => (
          <Row
            key={r.id}
            label={r.challenge!.role === 'set' ? `Set · ${r.challenge!.vehicleName}` : `${r.challenge!.result ?? ''} · ${r.challenge!.ownerName}`}
            value={`${Math.floor(r.challenge!.timeSec / 60)}:${String(Math.round(r.challenge!.timeSec % 60)).padStart(2, '0')}`}
          />
        ))
      )}
    </Page>
  ));

  for (let i = 0; i < Math.max(1, Math.ceil(allRides.length / RIDES_PER_PAGE)); i++) {
    const slice = allRides.slice(i * RIDES_PER_PAGE, (i + 1) * RIDES_PER_PAGE);
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>Ride log {i > 0 ? `(${i + 1})` : ''}</PageTitle>
        {slice.length === 0 ? (
          <p className="text-[9px] italic text-[#2b2118]/60">No rides logged yet.</p>
        ) : (
          <div className="space-y-[3px]">
            {slice.map((r) => (
              <div key={r.id} className="text-[9px] leading-[11px] border-b border-dashed border-[#2b2118]/20 pb-[3px]">
                <div className="flex justify-between gap-1">
                  <span className="font-bold truncate">{r.name || fmtDate(r.startedAt)}</span>
                  <span className="font-mono">{dist(r.distance)}</span>
                </div>
                <div className="flex justify-between gap-1 font-mono text-[8px] text-[#2b2118]/65">
                  <span className="truncate">{r.name ? fmtDate(r.startedAt) : r.owner}{r.isConvoyRide ? ' · convoy' : ''}</span>
                  <span>{formatDuration(r.duration)} · {spd(r.maxSpeed)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Page>
    ));
  }

  // Keep the hand-over page on the right of the final spread.
  if (pages.length % 2 === 0) {
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>Notes</PageTitle>
        <p className="text-[9px] italic text-[#2b2118]/50">Every ride on this vehicle is logged automatically.</p>
      </Page>
    ));
  }
  const handoverPageIndex = pages.length;
  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>Change of keeper</PageTitle>
      <p className="text-[9px] leading-snug">
        Selling or passing it on? The new keeper scans your code and gets this logbook, its trading card and its stats.
      </p>
      <p className="mt-1.5 text-[9px] leading-snug text-[#2b2118]/70">
        Your own ride history and totals stay with you.
      </p>
      <button
        onClick={() => {
          if (demoEnabled) {
            toast('Hand-over is off in demo mode');
            return;
          }
          setConfirmOpen(true);
        }}
        className="mt-auto mb-1 mx-auto flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 border-[#2b2118] bg-[#2b2118] text-[#f6eed9] active:scale-95 transition-transform"
      >
        <QrCode className="w-6 h-6" />
        <span className="text-[9px] font-black uppercase tracking-widest">Hand over</span>
      </button>
    </Page>
  ));

  // ── spreads ──────────────────────────────────────────────────────────────
  const spreads = Math.ceil(pages.length / 2);
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<'fwd' | 'back' | null>(null);
  const go = (to: number) => {
    const next = Math.max(0, Math.min(spreads - 1, to));
    if (next === spread) return;
    haptics.tick();
    setTurn(next > spread ? 'fwd' : 'back');
    setSpread(next);
  };
  const left = pages[spread * 2];
  const right = pages[spread * 2 + 1];

  // ── hand-over ────────────────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [handover, setHandover] = useState<null | { qr: string; startedAt: number; phase: 'waiting' | 'sending' | 'done' | 'expired' | 'failed'; who?: string; msg?: string }>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (handover?.phase !== 'waiting') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [handover?.phase]);
  useEffect(() => () => cancelRef.current?.(), []);

  const beginHandover = () => {
    const prev = getInheritedLog(bike.id);
    const myEntries = rides.filter((r) => r.bikeId === bike.id && r.endedAt).map((r) => toLogRide(r, myName));
    const pkg: LogbookPackage = {
      v: 1,
      bike: {
        name: bike.name,
        makeModel: bike.makeModel,
        photos: bike.photos,
        placement: bike.placement,
        baseOdometerKm: bike.baseOdometerKm,
        maintenance: bike.maintenance,
      },
      log: {
        owners: [...(prev?.owners ?? []), { name: myName, from: bike.createdAt, to: Date.now() }],
        rides: [...(prev?.rides ?? []), ...myEntries],
        archived: mergeAggregates(prev?.archived ?? emptyAggregate(), burnedAggregate(burnedTotals, bike.id)),
        passport: prev?.passport ?? passportFor(bike.id),
      },
      fromName: myName,
      handedOverAt: Date.now(),
    };
    const session = startHandover(pkg, {
      onClaimed: (who) => setHandover((h) => (h ? { ...h, phase: 'sending', who } : h)),
      onDelivered: () => {
        // It's theirs now: the vehicle leaves this garage; rides stay in history.
        detachBike(bike.id);
        setInheritedLog(bike.id, null);
        deleteBike(bike.id);
        haptics.success();
        setHandover((h) => (h ? { ...h, phase: 'done' } : h));
      },
      onExpired: () => setHandover((h) => (h ? { ...h, phase: 'expired' } : h)),
      onFailed: (msg) => setHandover((h) => (h ? { ...h, phase: 'failed', msg } : h)),
    });
    cancelRef.current = session.cancel;
    setHandover({ qr: session.qr, startedAt: Date.now(), phase: 'waiting' });
  };

  const closeHandover = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    const wasDone = handover?.phase === 'done';
    setHandover(null);
    if (wasDone) onBack();
  };

  const secondsLeft = handover ? Math.max(0, Math.ceil((SCAN_WINDOW_MS - (now - handover.startedAt)) / 1000)) : 0;
  const windowFrac = handover ? Math.max(0, 1 - (now - handover.startedAt) / SCAN_WINDOW_MS) : 0;

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom animate-fade-in">
      <style>{`
        @keyframes bt-page-fwd { from { transform: perspective(900px) rotateY(-80deg); opacity: .4 } to { transform: none; opacity: 1 } }
        @keyframes bt-page-back { from { transform: perspective(900px) rotateY(80deg); opacity: .4 } to { transform: none; opacity: 1 } }
      `}</style>

      <header className="flex items-center gap-3 mb-4">
        <HeaderButton onClick={onBack} aria-label="Back to garage">
          <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
        </HeaderButton>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] leading-tight truncate">Logbook</h1>
          <p className="text-[13px] text-muted-foreground truncate">{bike.name} · Garage</p>
        </div>
      </header>

      {/* Open book */}
      <div className="w-full max-w-md mx-auto h-[46dvh] min-h-[300px] max-h-[440px] rounded-xl border-[3px] border-black/85 bg-gradient-to-br from-[#7a4020] to-[#4a230e] p-2 shadow-[4px_6px_0_rgba(0,0,0,0.55)]">
        <div className="relative grid grid-cols-2 h-full gap-0">
          <div
            key={`l-${spread}`}
            className="h-full origin-right"
            style={turn === 'back' ? { animation: 'bt-page-back 0.45s ease-out' } : undefined}
          >
            {left ? left(spread * 2 + 1, 'l') : <div className="h-full rounded-l-md bg-[#f6eed9]" />}
          </div>
          <div
            key={`r-${spread}`}
            className="h-full origin-left"
            style={turn === 'fwd' ? { animation: 'bt-page-fwd 0.45s ease-out' } : undefined}
          >
            {right ? right(spread * 2 + 2, 'r') : <div className="h-full rounded-r-md bg-[#f6eed9]" />}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-3 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/30 to-transparent" />
        </div>
      </div>

      {/* Page controls */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          onClick={() => go(spread - 1)}
          disabled={spread === 0}
          className="w-12 h-12 rounded-full border border-border bg-card flex items-center justify-center disabled:opacity-30 active:scale-95"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-xs font-mono text-muted-foreground tabular-nums w-14 text-center">
          {spread + 1} / {spreads}
        </span>
        <button
          onClick={() => go(spread + 1)}
          disabled={spread === spreads - 1}
          className="w-12 h-12 rounded-full border border-border bg-card flex items-center justify-center disabled:opacity-30 active:scale-95"
          aria-label="Next page"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
      <div className="mt-3 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => go(Math.floor(handoverPageIndex / 2))}
          disabled={spread === spreads - 1}
        >
          <ChevronsRight className="w-4 h-4" /> Skip to end
        </Button>
      </div>

      {/* Warning before the QR is shown */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hand over {bike.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The new keeper gets this logbook, the vehicle's trading card and its stats. Once their phone confirms,{' '}
              {bike.name} is removed from your garage for good. Your own ride history and totals stay. The code is live for 10
              seconds; if nobody scans it, nothing changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={beginHandover}>
              Show code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR + 10 s window */}
      {handover && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-6 animate-fade-in">
          <div className="w-full max-w-xs flex flex-col items-center text-center gap-4">
            {handover.phase === 'waiting' && (
              <>
                <p className="text-sm font-semibold">Scan to take over {bike.name}</p>
                <div className="relative p-3 rounded-2xl bg-white">
                  <QRCodeSVG value={handover.qr} size={220} level="M" marginSize={1} />
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${windowFrac * 100}%` }} />
                </div>
                <p className="text-3xl font-black font-mono tabular-nums text-accent">{secondsLeft}s</p>
                <p className="text-xs text-muted-foreground">On their phone: Garage → + → Scan new logbook.</p>
                <Button variant="ghost" onClick={closeHandover}>
                  Cancel
                </Button>
              </>
            )}
            {handover.phase === 'sending' && (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-accent" />
                <p className="text-sm font-semibold">Handing over to {handover.who}…</p>
                <p className="text-xs text-muted-foreground">Keep both phones open.</p>
              </>
            )}
            {handover.phase === 'done' && (
              <>
                <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                  <Check className="w-7 h-7 text-accent" />
                </div>
                <p className="text-sm font-semibold">
                  {bike.name} is now with {handover.who}
                </p>
                <p className="text-xs text-muted-foreground">Removed from your garage. Your ride history stays.</p>
                <Button onClick={closeHandover}>Back to garage</Button>
              </>
            )}
            {(handover.phase === 'expired' || handover.phase === 'failed') && (
              <>
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">
                  {handover.phase === 'expired' ? 'Nobody scanned it in time' : 'Hand-over stopped'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {handover.msg ?? `${bike.name} stays in your garage. Show the code again when they're ready.`}
                </p>
                <Button onClick={closeHandover}>OK</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
