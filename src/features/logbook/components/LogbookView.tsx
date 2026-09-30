import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsRight, QrCode, Loader2, Check, X, PenLine } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useRideHistory, burnedAggregate, mergeAggregates, emptyAggregate } from '@/features/ride';
import { useGarage, useBikeStats, serviceStatus, type Bike } from '@/features/garage';
import { useVehicleCards } from '@/features/cards';
import { addLogNote, getInheritedLog, setInheritedLog, toLogRide, useInheritedLogs, NOTE_MAX_CHARS } from '../lib/logbookStore';
import { SCAN_WINDOW_MS, startHandover } from '../lib/transfer';
import type { LogNote, LogRide, LogbookPackage } from '../types';
import { passportFor } from '../lib/passport';
import { tr } from '@/lib/i18n';
import { keepPeakTelemetry, PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';

const RIDES_PER_PAGE = 7;
/** Rough line budget of a page, used to flow notes onto as many pages as they need. */
const NOTE_LINES_PER_PAGE = 24;
const NOTE_CHARS_PER_LINE = 30;
const noteLines = (n: LogNote) => 1.6 + Math.ceil(n.text.length / NOTE_CHARS_PER_LINE);
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
  const peaksHidden = usePeaksHidden();
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
  // Best lap per circuit across every keeper's track days.
  const trackBests = Object.values(
    allRides.reduce<Record<string, { name: string; best: number | null; days: number; owner: string; at: string }>>((acc, r) => {
      if (!r.track) return acc;
      const k = r.track.trackName;
      const cur = acc[k] ?? { name: k, best: null, days: 0, owner: r.owner, at: r.startedAt };
      cur.days += 1;
      if (r.track.bestLapMs != null && (cur.best == null || r.track.bestLapMs < cur.best)) {
        cur.best = r.track.bestLapMs;
        cur.owner = r.owner;
        cur.at = r.startedAt;
      }
      acc[k] = cur;
      return acc;
    }, {}),
  );
  const badgeCounts = allRides.reduce<Record<string, number>>((acc, r) => {
    (r.earnedBadges ?? []).forEach((b) => (acc[b] = (acc[b] ?? 0) + 1));
    return acc;
  }, {});
  const longest = allRides.reduce<LogRide | null>((m, r) => (!m || r.distance > m.distance ? r : m), null);
  const fastest = allRides.reduce<LogRide | null>((m, r) => (r.maxSpeed != null && (!m || r.maxSpeed > m.maxSpeed) ? r : m), null);

  // ── pages ────────────────────────────────────────────────────────────────
  const pages: ((n: number, side: 'l' | 'r') => React.ReactNode)[] = [];

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <p className="text-center text-[9px] font-black uppercase tracking-[0.25em]">{tr("Vehicle Logbook")}</p>
      <div className="mt-2 mx-auto w-full aspect-[4/3] rounded border-2 border-[#2b2118]/70 bg-[#e6d9b8] flex items-center justify-center overflow-hidden">
        {bike.photos?.hero ? (
          <img src={bike.photos.hero} alt={bike.name} className="max-h-full max-w-full object-contain [image-rendering:pixelated]" />
        ) : (
          <span className="text-[9px] text-[#2b2118]/50">{tr("No photo")}</span>
        )}
      </div>
      <p className="mt-2 text-center text-[13px] font-black leading-tight truncate">{bike.name}</p>
      {bike.makeModel && <p className="text-center text-[9px] uppercase tracking-wider text-[#2b2118]/70 truncate">{bike.makeModel}</p>}
      <div className="mt-auto space-y-0.5">
        <Row label={tr("Passport")} value={passport} />
        <Row label={tr("Keeper")} value={myName} />
        <Row label={tr("Card")} value={card?.tierLabel ?? '—'} />
      </div>
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>{tr("Keepers")}</PageTitle>
      <div className="space-y-1.5">
        {owners.map((o, i) => (
          <div key={i} className="text-[9.5px] leading-tight">
            <p className="font-bold">
              {i + 1}. {o.name}
              {i === owners.length - 1 && <span className="ml-1 text-[8px] uppercase tracking-wider text-[#8a3b12]">{tr("current")}</span>}
            </p>
            <p className="font-mono text-[8.5px] text-[#2b2118]/70">
              {fmtDate(o.from)} → {o.to ? fmtDate(o.to) : 'now'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-auto text-[8.5px] italic text-[#2b2118]/60">{tr("History travels with the vehicle when it changes hands.")}</p>
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>{tr("Lifetime stats")}</PageTitle>
      <Row label={tr("Odometer")} value={kmOrMi(stats.odometerKm)} />
      <Row label={tr("Rides")} value={stats.totalRides} />
      <Row label={tr("Distance")} value={dist(stats.totalDistanceMi)} />
      <Row label={tr("Riding time")} value={formatDuration(stats.totalDurationSec)} />
      {/* "--" while Public Road Privacy is on, and where no owner shared the peak (0 over real rides). */}
      <Row label={tr("Top speed")} value={peaksHidden || !stats.topSpeedMph ? PEAK_HIDDEN : spd(stats.topSpeedMph)} />
      <Row label={tr("Lean L / R")} value={peaksHidden || !(stats.maxLeanLeft || stats.maxLeanRight) ? PEAK_HIDDEN : `${Math.round(stats.maxLeanLeft)}° / ${Math.round(stats.maxLeanRight)}°`} />
      <Row label={tr("Peak G")} value={peaksHidden ? PEAK_HIDDEN : stats.maxGForce > 0 ? stats.maxGForce.toFixed(2) : '—'} />
      <Row label={tr("Longest ride")} value={dist(stats.longestRideMi)} />
      <Row label={tr("Convoy rides")} value={allRides.filter((r) => r.isConvoyRide).length} />
    </Page>
  ));

  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>{tr("Service record")}</PageTitle>
      {bike.maintenance.length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">{tr("No service items logged.")}</p>
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
                    {st.tone === 'over' ? tr("Overdue") : st.tone === 'warn' ? tr("Due soon") : tr("OK")}
                  </span>
                </div>
                <p className="font-mono text-[8px] text-[#2b2118]/70">
                  {tr("every")}{" "}{kmOrMi(m.intervalKm)}
                  {m.intervalMonths ? ` / ${m.intervalMonths} mo` : ''}{" "}{tr("· last")}{" "}{kmOrMi(m.lastServiceKm)}
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
      <PageTitle>{tr("Highlights")}</PageTitle>
      <Row label={tr("Longest")} value={longest ? dist(longest.distance) : '—'} />
      {longest && <p className="text-[8px] font-mono text-[#2b2118]/60 -mt-0.5 mb-1">{fmtDate(longest.startedAt)} · {longest.owner}</p>}
      <Row label={tr("Fastest")} value={peaksHidden ? PEAK_HIDDEN : fastest && fastest.maxSpeed > 0 ? spd(fastest.maxSpeed) : '—'} />
      {fastest && <p className="text-[8px] font-mono text-[#2b2118]/60 -mt-0.5 mb-1">{fmtDate(fastest.startedAt)} · {fastest.owner}</p>}
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider">{tr("Badges")}</p>
      {Object.keys(badgeCounts).length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">{tr("None yet.")}</p>
      ) : (
        Object.entries(badgeCounts).map(([b, c]) => <Row key={b} label={b.replace(/-/g, ' ')} value={`×${c}`} />)
      )}
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider">{tr("Time attacks")}</p>
      {challenges.length === 0 ? (
        <p className="text-[9px] italic text-[#2b2118]/60">{tr("None yet.")}</p>
      ) : (
        challenges.slice(0, 4).map((r) => (
          <Row
            key={r.id}
            label={r.challenge!.role === 'set' ? tr("Set · {0}", [r.challenge!.vehicleName]) : `${r.challenge!.result ?? ''} · ${r.challenge!.ownerName}`}
            value={`${Math.floor(r.challenge!.timeSec / 60)}:${String(Math.round(r.challenge!.timeSec % 60)).padStart(2, '0')}`}
          />
        ))
      )}
      {trackBests.length > 0 && (
        <>
          <p className="mt-1 text-[9px] font-black uppercase tracking-wider">{tr("Track days")}</p>
          {trackBests.slice(0, 4).map((t) => (
            <Row key={t.name} label={`${t.name} ×${t.days}`} value={t.best != null ? `${Math.floor(t.best / 60000)}:${((t.best % 60000) / 1000).toFixed(3).padStart(6, '0')}` : '—'} />
          ))}
        </>
      )}
    </Page>
  ));

  for (let i = 0; i < Math.max(1, Math.ceil(allRides.length / RIDES_PER_PAGE)); i++) {
    const slice = allRides.slice(i * RIDES_PER_PAGE, (i + 1) * RIDES_PER_PAGE);
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>{tr("Ride log")}{" "}{i > 0 ? `(${i + 1})` : ''}</PageTitle>
        {slice.length === 0 ? (
          <p className="text-[9px] italic text-[#2b2118]/60">{tr("No rides logged yet.")}</p>
        ) : (
          <div className="space-y-[3px]">
            {slice.map((r) => (
              <div key={r.id} className="text-[9px] leading-[11px] border-b border-dashed border-[#2b2118]/20 pb-[3px]">
                <div className="flex justify-between gap-1">
                  <span className="font-bold truncate">{r.name || fmtDate(r.startedAt)}</span>
                  <span className="font-mono">{dist(r.distance)}</span>
                </div>
                <div className="flex justify-between gap-1 font-mono text-[8px] text-[#2b2118]/65">
                  <span className="truncate">{r.name ? fmtDate(r.startedAt) : r.owner}{r.isConvoyRide ? tr(" · convoy") : ''}</span>
                  {/* No max speed on rides kept under Public Road Privacy. */}
                  <span>{formatDuration(r.duration)} · {peaksHidden || r.maxSpeed == null ? PEAK_HIDDEN : spd(r.maxSpeed)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Page>
    ));
  }

  // Notes: remarks from every keeper, flowing onto as many pages as needed.
  // The last notes page carries "Add a note".
  const notes = [...(inherited?.notes ?? [])].sort((a, b) => a.at - b.at);
  const notePages: LogNote[][] = [[]];
  let used = 0;
  for (const note of notes) {
    const h = noteLines(note);
    if (used + h > NOTE_LINES_PER_PAGE && notePages[notePages.length - 1].length > 0) {
      notePages.push([]);
      used = 0;
    }
    notePages[notePages.length - 1].push(note);
    used += h;
  }
  // No room left for the button on the last page: give it a fresh page.
  if (used > NOTE_LINES_PER_PAGE - 3) notePages.push([]);
  notePages.forEach((pageNotes, i) => {
    const isLast = i === notePages.length - 1;
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>{i === 0 ? tr("Notes") : tr("Notes (cont.)")}</PageTitle>
        {notes.length === 0 && i === 0 && (
          <p className="text-[9px] italic text-[#2b2118]/55">{tr("No remarks yet. Mods, quirks, tyre changes, anything the next keeper should know.")}</p>
        )}
        <div className="space-y-1.5">
          {pageNotes.map((note) => (
            <div key={note.id} className="leading-tight">
              <p className="font-serif italic text-[10px] text-[#1f2a5a] break-words">{tr("“{0}”", [note.text])}</p>
              <p className="font-mono text-[7.5px] text-[#2b2118]/60 mt-0.5">
                {note.author} · {fmtDate(note.at)}
              </p>
            </div>
          ))}
        </div>
        {isLast && (
          <button
            onClick={() => {
              if (demoEnabled) {
                toast(tr("Notes are read-only in demo mode"));
                return;
              }
              setNoteOpen(true);
            }}
            className="mt-auto mb-1 mx-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border-2 border-dashed border-[#2b2118]/60 text-[9px] font-bold uppercase tracking-wider active:scale-95"
          >
            <PenLine className="w-3 h-3" />{" "}{tr("Add a note")}
          </button>
        )}
      </Page>
    ));
  });

  // Keep the hand-over page on the right of the final spread.
  if (pages.length % 2 === 0) {
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <p className="mt-auto text-center text-[9px] italic text-[#2b2118]/45">{tr("This page intentionally left blank")}</p>
      </Page>
    ));
  }
  const handoverPageIndex = pages.length;
  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>{tr("Change of keeper")}</PageTitle>
      <p className="text-[9px] leading-snug">
        {tr("Selling or passing it on? The new keeper scans your code and gets this logbook, its trading card and its stats.")}
      </p>
      <p className="mt-1.5 text-[9px] leading-snug text-[#2b2118]/70">
        {tr("Your own ride history and totals stay with you.")}
      </p>
      <button
        onClick={() => {
          if (demoEnabled) {
            toast(tr("Hand-over is off in demo mode"));
            return;
          }
          setConfirmOpen(true);
        }}
        className="mt-auto mb-1 mx-auto flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 border-[#2b2118] bg-[#2b2118] text-[#f6eed9] active:scale-95 transition-transform"
      >
        <QrCode className="w-6 h-6" />
        <span className="text-[9px] font-black uppercase tracking-widest">{tr("Hand over")}</span>
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const saveNote = () => {
    if (!noteText.trim()) return;
    addLogNote(bike.id, { author: myName, text: noteText });
    setNoteText('');
    setNoteOpen(false);
    haptics.success();
    toast.success(tr("Note added to the logbook"));
  };
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
    // Public Road Privacy: peaks don't leave the phone, not even to the next owner (they read "--").
    const sharePeaks = keepPeakTelemetry(false);
    const myEntries = rides
      .filter((r) => r.bikeId === bike.id && r.endedAt)
      .map((r) => toLogRide(r, myName))
      .map((r) => (sharePeaks ? r : { ...r, maxSpeed: null, maxLeanLeft: null, maxLeanRight: null, maxGForce: null }));
    const burned = burnedAggregate(burnedTotals, bike.id);
    const myArchived = sharePeaks ? burned : { ...burned, maxSpeed: 0, maxLeanLeft: 0, maxLeanRight: 0, maxGForce: 0 };
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
        archived: mergeAggregates(prev?.archived ?? emptyAggregate(), myArchived),
        passport: prev?.passport ?? passportFor(bike.id),
        notes: prev?.notes ?? [],
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
        <HeaderButton onClick={onBack} aria-label={tr("Back to garage")}>
          <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
        </HeaderButton>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] leading-tight truncate">{tr("Logbook")}</h1>
          <p className="text-[13px] text-muted-foreground truncate">{bike.name}{" "}{tr("· Garage")}</p>
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
          aria-label={tr("Previous page")}
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
          aria-label={tr("Next page")}
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
          <ChevronsRight className="w-4 h-4" />{" "}{tr("Skip to end")}
        </Button>
      </div>

      {/* Write a remark into the logbook */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Add a note")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value.slice(0, NOTE_MAX_CHARS))}
            placeholder={tr("New tyres, a quirk, a mod, a great ride…")}
            rows={4}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {noteText.length} / {NOTE_MAX_CHARS}{" "}{tr("· signed")}{" "}{myName}
            </span>
            <Button onClick={saveNote} disabled={!noteText.trim()}>
              {tr("Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warning before the QR is shown */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Hand over")}{" "}{bike.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("The new keeper gets this logbook, the vehicle's trading card and its stats. Once their phone confirms,")}{' '}
              {bike.name}{" "}{tr("is removed from your garage for good. Your own ride history and totals stay. The code is live for 10 seconds; if nobody scans it, nothing changes.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Keep it")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={beginHandover}>
              {tr("Show code")}
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
                <p className="text-sm font-semibold">{tr("Scan to take over")}{" "}{bike.name}</p>
                <div className="relative p-3 rounded-2xl bg-white">
                  <QRCodeSVG value={handover.qr} size={220} level="M" marginSize={1} />
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${windowFrac * 100}%` }} />
                </div>
                <p className="text-3xl font-black font-mono tabular-nums text-accent">{secondsLeft}{tr("s")}</p>
                <p className="text-xs text-muted-foreground">{tr("On their phone: Garage → + → Scan new logbook.")}</p>
                <Button variant="ghost" onClick={closeHandover}>
                  {tr("Cancel")}
                </Button>
              </>
            )}
            {handover.phase === 'sending' && (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-accent" />
                <p className="text-sm font-semibold">{tr("Handing over to")}{" "}{handover.who}…</p>
                <p className="text-xs text-muted-foreground">{tr("Keep both phones open.")}</p>
              </>
            )}
            {handover.phase === 'done' && (
              <>
                <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                  <Check className="w-7 h-7 text-accent" />
                </div>
                <p className="text-sm font-semibold">
                  {bike.name}{" "}{tr("is now with")}{" "}{handover.who}
                </p>
                <p className="text-xs text-muted-foreground">{tr("Removed from your garage. Your ride history stays.")}</p>
                <Button onClick={closeHandover}>{tr("Back to garage")}</Button>
              </>
            )}
            {(handover.phase === 'expired' || handover.phase === 'failed') && (
              <>
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">
                  {handover.phase === 'expired' ? tr("Nobody scanned it in time") : tr("Hand-over stopped")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {handover.msg ?? tr("{0} stays in your garage. Show the code again when they're ready.", [bike.name])}
                </p>
                <Button onClick={closeHandover}>{tr("OK")}</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
