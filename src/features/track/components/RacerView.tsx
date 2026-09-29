import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Flag, Trash2, Pencil, QrCode, Users, Satellite, X, Footprints, Map as MapIcon, Check, Timer, History, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useActiveRide } from '@/features/ride';
import { getActiveBikeIdSnapshot } from '@/features/garage';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useLeanAngle } from '@/hooks/useLeanAngle';
import { useExperience } from '@/features/experience';
import { GForceCircle } from '@/components/GForceCircle';
import { useGForce } from '@/hooks/useGForce';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { TrackDef, TrackSession } from '../types';
import { RIDER_CALLS } from '../types';
import { pitLabel } from '../lib/pitCalls';
import { deleteTrack, markTrackUsed, saveTrack, toggleStar, trackLength, useTrackStore } from '../lib/trackStore';
import { loadCircuit, type LibraryCircuit, type LibraryLayout } from '../lib/circuitLibrary';
import { TRACK_QR_PREFIX } from '../lib/link';
import {
  armTrack,
  cancelWalk,
  closeRacerLink,
  disarm,
  dismissPit,
  endSession,
  finishLapNow,
  finishWalk,
  launchNow,
  openRacerLink,
  redoLap,
  selectTrack,
  sendRiderCall,
  startWalk,
  updateSensors,
  useRacer,
} from '../lib/session';
import { formatLap } from '../lib/timing';
import { metres as distanceBetween } from '../lib/geometry';
import { theoreticalBest } from '../lib/laps';
import { TrackEditor } from './TrackEditor';
import { TrackSearch } from './TrackSearch';
import { TrackMinimap } from './TrackMinimap';
import { SessionDetail } from './SessionDetail';
import { TrackVoice } from './TrackVoice';
import { DeltaReadout, SectorBoxes } from './TimingParts';
import { tr } from '@/lib/i18n';

export function RacerView() {
  const racer = useRacer();
  const { tracks, sessions } = useTrackStore();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const { rideState, startRide, endRide, updateLeanAngle, updateGForce } = useActiveRide();
  const [editing, setEditing] = useState<TrackDef | 'new' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [viewing, setViewing] = useState<TrackSession | null>(null);
  const [importing, setImporting] = useState<LibraryLayout | null>(null);
  const [loadingCircuit, setLoadingCircuit] = useState<number | null>(null);
  const riderName = profile.name || 'Racer';

  const { phase } = racer;
  const sensorsOn = phase === 'armed' || phase === 'running';
  const lean = useLeanAngle(sensorsOn);
  const { canLean } = useExperience();
  // Cornering G for a leaning bike comes from the lean (see lib/gForceVector).
  const leanForGRef = useRef<number | null>(null);
  leanForGRef.current = canLean && lean.isSupported && lean.permissionGranted ? lean.currentLean : null;
  const gForce = useGForce(sensorsOn, { leanRef: leanForGRef });
  // Gravity-free G (the friction circle's), for the timer, the pit crew and the traces.
  const dynamicG = Math.hypot(gForce.lateralG, gForce.longitudinalG);
  const wakeLock = useWakeLock();

  // The pairing link opens on entry so the crew can join at any point.
  useEffect(() => {
    openRacerLink(riderName);
    return () => closeRacerLink();
  }, [riderName]);

  const busy = phase !== 'idle';
  useEffect(() => {
    if (!busy) return;
    wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Feed lean / G into the timer (and the ride, so its stats have them too).
  useEffect(() => {
    if (!sensorsOn) return;
    updateSensors(lean.currentLean, dynamicG);
    if (phase === 'running') {
      if (lean.isSupported) updateLeanAngle(lean.currentLean, lean.maxLeanLeft, lean.maxLeanRight);
      if (gForce.isSupported) updateGForce(gForce.currentG, gForce.maxG, { envelope: gForce.envelope, max: gForce.gMax });
    }
    // The G vector fields change together with currentG (same state update).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorsOn, phase, lean.currentLean, lean.maxLeanLeft, lean.maxLeanRight, lean.isSupported, gForce.currentG, gForce.maxG, gForce.isSupported, updateLeanAngle, updateGForce]);

  useEffect(() => {
    if (!racer.pit) return;
    const t = setTimeout(dismissPit, 8000);
    return () => clearTimeout(t);
  }, [racer.pit]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 47);
    return () => clearInterval(id);
  }, [phase]);

  const arm = async (t: TrackDef) => {
    if (rideState.isActive) {
      toast.error(tr("Finish your current ride first"));
      return;
    }
    haptics.medium();
    markTrackUsed(t.id);
    await Promise.all([lean.requestPermission?.(), gForce.requestPermission?.()]).catch(() => {});
    armTrack(t, riderName, () => {
      // The ride (history + totals) starts with the launch.
      if (!startRide(false)) toast.error(tr("Location is needed for the ride log"));
    });
  };

  const end = async () => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    const session = endSession(getActiveBikeIdSnapshot() ?? undefined);
    await endRide();
    setConfirmEnd(false);
    setViewing(session);
    haptics.success();
  };

  const track = racer.track;
  const sectors = (track?.splits.length ?? 0) + 1;
  const lastLap = racer.laps.length ? racer.laps[racer.laps.length - 1] : null;
  const bestBefore = useMemo(() => racer.bestSectors, [racer.bestSectors]);
  const elapsed = racer.lapStartT !== null ? Math.max(0, now - racer.lapStartT) : null;
  const theo = theoreticalBest(racer.laps, sectors);
  const gpsTone = racer.gpsHz >= 5 ? 'text-[#22c55e]' : racer.gpsHz >= 2 ? 'text-warning' : 'text-destructive';
  const qrValue = racer.token ? TRACK_QR_PREFIX + racer.token : null;

  const statusBar = (
    <div className="flex items-center gap-2 text-xs">
      <Zap className="w-4 h-4 text-accent" />
      <span className="font-semibold truncate">{phase === 'walking' ? tr("New track") : track?.name}</span>
      <span className={cn('ml-auto flex items-center gap-1 font-mono', gpsTone)} title={tr("GPS fixes per second")}>
        <Satellite className="w-3.5 h-3.5" /> {racer.gpsHz || '–'}{" "}{tr("Hz")}
      </span>
      <TrackVoice linkToken={racer.token} />
      <button onClick={() => setShowQr(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border" aria-label={tr("Pit crew QR")}>
        <Users className="w-3.5 h-3.5" /> {racer.crew.length}
      </button>
    </div>
  );
  const qrOverlay = showQr && qrValue && <QrOverlay value={qrValue} crew={racer.crew} onClose={() => setShowQr(false)} />;

  /** Library layout → the chase cam, to place the start/finish and sectors. */
  const importCircuit = async (c: LibraryCircuit) => {
    const existing = tracks.find((t) => t.osmId === c.id);
    if (existing) {
      selectTrack(existing);
      return;
    }
    setLoadingCircuit(c.id);
    try {
      setImporting(await loadCircuit(c.id));
    } catch {
      toast.error(tr("Couldn't load {0}", [c.name]), { description: tr("Check your connection, or build it from the map.") });
    } finally {
      setLoadingCircuit(null);
    }
  };

  if (editing || importing) {
    const done = (t: TrackDef) => {
      saveTrack(t);
      selectTrack(t);
      setEditing(null);
      setImporting(null);
      toast.success(tr("{0} saved", [t.name]), { description: tr("{0} sectors. Ready up when you're on the grid.", [t.splits.length + 1]) });
    };
    return (
      <TrackEditor
        initial={editing && editing !== 'new' ? editing : undefined}
        library={importing ?? undefined}
        onCancel={() => {
          setEditing(null);
          setImporting(null);
        }}
        onSave={done}
      />
    );
  }

  if (viewing) return <SessionDetail session={viewing} onBack={() => setViewing(null)} />;

  // ── Recording a lap to create a track ────────────────────────────────────
  if (phase === 'walking' && racer.walkLoop) {
    return (
      <TrackEditor
        loop={racer.walkLoop}
        onCancel={cancelWalk}
        onSave={(t) => {
          saveTrack(t);
          finishWalk(t);
          selectTrack(t);
          toast.success(tr("{0} saved", [t.name]), { description: tr("{0} sectors", [t.splits.length + 1]) });
        }}
      />
    );
  }
  if (phase === 'walking' && racer.walk) {
    const w = racer.walk;
    const gap = w.trail.length > 1 ? Math.round(distanceBetween(w.trail[0], w.trail[w.trail.length - 1])) : null;
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
        {statusBar}
        <TrackMinimap
          className="flex-1 min-h-[240px]"
          lines={[{ points: w.trail, color: 'hsl(var(--accent))', width: 1.4 }]}
          dot={w.trail[w.trail.length - 1] ?? null}
        />
        <div className="text-center space-y-1">
          <p className="font-mono text-2xl font-bold">{w.travelled >= 1000 ? tr("{0} km", [(w.travelled / 1000).toFixed(2)]) : tr("{0} m", [Math.round(w.travelled)])}</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {w.trail.length < 2
              ? tr("Ride or walk one lap of the track. Recording starts as soon as GPS locks on.")
              : tr("Keep going. The lap closes by itself when you’re back on your line, then you place the start/finish and sectors.")}
          </p>
          {racer.canClose && gap !== null && <p className="text-[11px] text-muted-foreground">{gap}{" "}{tr("m from where you started")}</p>}
        </div>
        <Button
          variant="secondary"
          className="h-14 gap-2"
          disabled={!racer.canClose}
          onClick={() => {
            if (!finishLapNow()) toast(tr("Go a bit further round first"));
          }}
        >
          <Check className="w-5 h-5" />{" "}{tr("Finish the lap here")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={redoLap} disabled={w.trail.length < 2}>
            {tr("Start again")}
          </Button>
          <Button variant="ghost" onClick={cancelWalk}>
            {tr("Cancel")}
          </Button>
        </div>
        {qrOverlay}
      </div>
    );
  }

  // ── On the grid: waiting for the launch ──────────────────────────────────
  if (phase === 'armed' && track) {
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
        {statusBar}
        <TrackMinimap className="aspect-square max-h-[40dvh] mx-auto w-full" outline={track.outline} startFinish={track.startFinish} splits={track.splits} />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <div className="w-24 h-24 rounded-full border-4 border-accent flex items-center justify-center animate-pulse">
            <Timer className="w-10 h-10 text-accent" />
          </div>
          <p className="text-lg font-bold">{tr("Get into position")}</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {tr("Timing starts by itself the moment you launch. On the start/finish line, lap 1 starts with you; from behind it, at the line.")}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            {tr("GPS")}{" "}{racer.gpsHz || '–'}{" "}{tr("Hz · ±")}{racer.gpsAccuracy != null ? Math.round(racer.gpsAccuracy) : '–'}{" "}{tr("m")}
          </p>
        </div>
        <Button variant="secondary" onClick={launchNow}>
          {tr("Start timing now (rolling start)")}
        </Button>
        <Button variant="ghost" onClick={disarm}>
          {tr("Cancel")}
        </Button>
        {qrOverlay}
      </div>
    );
  }

  // ── Live timing ───────────────────────────────────────────────────────────
  if (phase === 'running' && track) {
    return (
      <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom gap-3 bg-background">
        {statusBar}
        <div className="flex-1 flex flex-col landscape:flex-row gap-3">
          <div className="flex-1 flex flex-col justify-center items-center rounded-3xl border-[3px] border-accent bg-card/50 py-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              {racer.lapNumber === 0 ? tr("Out lap") : tr("Lap {0}", [racer.lapNumber])}
            </p>
            <p className="font-mono font-black tabular-nums text-6xl landscape:text-5xl leading-none mt-1">{elapsed !== null ? formatLap(elapsed) : '0:00.000'}</p>
            <DeltaReadout delta={racer.delta} className="text-3xl mt-2" />
            <p className="text-[10px] text-muted-foreground">{tr("vs best")}</p>
          </div>
          <div className="landscape:w-[45%] flex flex-col gap-2">
            <SectorBoxes count={sectors} splits={racer.splits.map((s) => s.ms)} bestBefore={bestBefore} lastLap={lastLap} big />
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={tr("Last")} value={formatLap(lastLap?.ms)} />
              <Stat label={tr("Best")} value={formatLap(racer.bestLap?.ms)} accent />
              <Stat label={tr("Theoretical")} value={formatLap(theo)} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={getSpeedLabel(settings.speedUnit)} value={String(formatSpeed(racer.speed * 2.23694, settings.speedUnit))} />
              <Stat label={tr("Lean")} value={lean.isSupported ? `${Math.round(Math.abs(racer.lean))}°` : '—'} />
              <Stat label={tr("G")} value={gForce.isSupported ? racer.g.toFixed(2) : '—'} />
            </div>
            {gForce.isSupported && (
              <div className="flex justify-center pt-1">
                <GForceCircle lateral={gForce.lateralG} longitudinal={gForce.longitudinalG} envelope={gForce.envelope} max={gForce.gMax} className="w-44 landscape:w-36" />
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {RIDER_CALLS.map((c) => (
            <Button key={c} variant="secondary" className="h-11 text-xs" onClick={() => sendRiderCall(c)} disabled={racer.crew.length === 0}>
              {pitLabel(c)}
            </Button>
          ))}
        </div>
        <Button variant="outline" className={cn('h-12 border-2', confirmEnd ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-destructive/60 text-destructive')} onClick={end}>
          <Flag className="w-4 h-4 mr-2" /> {confirmEnd ? tr("Tap again to end the session") : tr("End session")}
        </Button>

        {racer.pit && (
          <button onClick={dismissPit} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
            <div className="absolute inset-3 rounded-3xl border-[6px] border-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-accent">{tr("Pit board")}</span>
            <span className="mt-2 text-8xl font-black tracking-tight text-center px-4 leading-none text-white">{pitLabel(racer.pit.text)}</span>
            <span className="mt-6 text-xs text-white/60">{tr("Tap to dismiss")}</span>
          </button>
        )}
        {qrOverlay}
      </div>
    );
  }

  // ── Track Pack home: search, build, your tracks, sessions ────────────────
  const selected = phase === 'idle' && track ? tracks.find((t) => t.id === track.id) ?? null : null;
  const lastUsed = (t: TrackDef) =>
    Math.max(t.lastUsedAt ?? 0, ...sessions.filter((x) => x.trackId === t.id).map((x) => x.startedAt), t.createdAt ?? 0);
  const previous = [...tracks].sort((a, b) => lastUsed(b) - lastUsed(a));
  const custom = tracks.filter((t) => t.source !== 'library').sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const favourites = tracks.filter((t) => t.starred).sort((a, b) => a.name.localeCompare(b.name));
  const pick = (t: TrackDef) => {
    haptics.light();
    selectTrack(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader
        title={tr("Track Pack")}
        subtitle={tr("Racer")}
        backTo="/"
        right={
          <div className="flex items-center gap-1.5">
            <TrackVoice linkToken={racer.token} />
            <button onClick={() => setShowQr(true)} className="flex items-center gap-1 h-9 px-2.5 rounded-xl frost-accent text-xs" aria-label={tr("Pit crew QR")}>
              <QrCode className="w-4 h-4" /> {racer.crew.length}
            </button>
          </div>
        }
      />

      <TrackSearch tracks={tracks} onPickTrack={pick} onPickCircuit={importCircuit} loadingId={loadingCircuit} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-12 gap-2" onClick={() => startWalk(riderName)}>
          <Footprints className="w-5 h-5" />{" "}{tr("Ride a lap (GPS)")}
        </Button>
        <Button variant="secondary" className="h-12 gap-2" onClick={() => setEditing('new')}>
          <MapIcon className="w-5 h-5" />{" "}{tr("Pick on the map")}
        </Button>
      </div>

      {selected && (
        <SelectedTrack
          track={selected}
          best={bestFor(sessions, selected.id)}
          crew={racer.crew}
          onReady={() => arm(selected)}
          onEdit={() => setEditing(selected)}
          onStar={() => toggleStar(selected.id)}
          onDelete={() => {
            deleteTrack(selected.id);
            selectTrack(null);
            toast(tr("{0} deleted", [selected.name]));
          }}
          onClose={() => selectTrack(null)}
          onShowQr={() => setShowQr(true)}
        />
      )}

      <TrackShelf
        title={tr("Previous tracks")}
        icon={<History className="w-4 h-4 text-accent" />}
        hint={tr("Last raced first")}
        empty={tr("Tracks you save or race show up here.")}
        tracks={previous}
        sessions={sessions}
        selectedId={selected?.id}
        onPick={pick}
      />
      <TrackShelf
        title={tr("Custom tracks")}
        icon={<Pencil className="w-4 h-4 text-accent" />}
        hint={tr("Built by you")}
        empty={tr("Tracks you build from the map or a GPS lap show up here.")}
        tracks={custom}
        sessions={sessions}
        selectedId={selected?.id}
        onPick={pick}
      />
      <TrackShelf
        title={tr("Favourite tracks")}
        icon={<Star className="w-4 h-4 text-accent fill-current" />}
        hint={tr("Starred")}
        empty={tr("Tap the star on any track to keep it here.")}
        tracks={favourites}
        sessions={sessions}
        selectedId={selected?.id}
        onPick={pick}
      />

      {sessions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
            <History className="w-3 h-3" />{" "}{tr("Sessions")}
          </p>
          <div className="space-y-1.5">
            {sessions.slice(0, 12).map((s) => {
              const best = s.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0];
              return (
                <button key={s.id} onClick={() => setViewing(s)} className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 px-3 py-2 text-left">
                  <span>
                    <span className="block text-sm font-medium">{s.trackName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {s.laps.length}{" "}{tr("laps")}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-sm">{formatLap(best?.ms)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {qrOverlay}
    </div>
  );
}

const km = (m: number | null) => (m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/** One horizontally scrolling row of track cards, like the card vault's shelves. */
export function TrackShelf({
  title,
  icon,
  hint,
  empty,
  tracks,
  sessions,
  selectedId,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  empty: string;
  tracks: TrackDef[];
  sessions: TrackSession[];
  selectedId?: string;
  onPick: (t: TrackDef) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground">{tracks.length}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground/70">{empty}</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tracks.map((t) => (
            <TrackCard key={t.id} track={t} best={bestFor(sessions, t.id)} selected={t.id === selectedId} onPick={() => onPick(t)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrackCard({ track: t, best, selected, onPick }: { track: TrackDef; best: number | null; selected: boolean; onPick: () => void }) {
  return (
    <div className={cn('relative snap-start flex-shrink-0 w-[46%] max-w-[190px] rounded-2xl border bg-card/50 p-2', selected ? 'border-accent' : 'border-border')}>
      <button onClick={onPick} className="w-full text-left" aria-label={tr("Select {0}", [t.name])}>
        <TrackMinimap className="aspect-square w-full p-1.5" outline={t.outline} startFinish={t.startFinish} splits={t.splits} />
        <span className="block mt-1.5 text-sm font-semibold leading-tight truncate">{t.name}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {[km(trackLength(t)), `${t.splits.length + 1} sectors`].filter(Boolean).join(' · ')}
        </span>
        <span className="block text-[11px] text-muted-foreground font-mono">{tr("Best")}{" "}{formatLap(best)}</span>
      </button>
      <button
        onClick={() => toggleStar(t.id)}
        className={cn('absolute top-3 right-3 p-1.5 rounded-full frost-accent', t.starred ? 'text-accent' : 'text-muted-foreground')}
        aria-label={t.starred ? tr("Unfavourite {0}", [t.name]) : tr("Favourite {0}", [t.name])}
        aria-pressed={!!t.starred}
      >
        <Star className={cn('w-3.5 h-3.5', t.starred && 'fill-current')} />
      </button>
    </div>
  );
}

/** The picked track: what the pit crew sees, and the Ready up button that puts the racer on the grid. */
export function SelectedTrack({
  track,
  best,
  crew,
  onReady,
  onEdit,
  onStar,
  onDelete,
  onClose,
  onShowQr,
}: {
  track: TrackDef;
  best: number | null;
  crew: { id: string; name: string }[];
  onReady: () => void;
  onEdit: () => void;
  onStar: () => void;
  onDelete: () => void;
  onClose: () => void;
  onShowQr: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  return (
    <div className="rounded-3xl border-2 border-accent bg-card/60 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-accent">{tr("Selected track")}</p>
          <p className="text-lg font-bold leading-tight truncate">{track.name}</p>
          <p className="text-xs text-muted-foreground">
            {[km(trackLength(track)), `${track.splits.length + 1} sectors`, `best ${formatLap(best)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={onStar} className={cn('p-2 rounded-lg', track.starred ? 'text-accent' : 'text-muted-foreground')} aria-label={track.starred ? tr("Unstar") : tr("Star")} aria-pressed={!!track.starred}>
          <Star className={cn('w-5 h-5', track.starred && 'fill-current')} />
        </button>
        <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground" aria-label={tr("Close")}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <TrackMinimap className="aspect-[4/3] w-full" outline={track.outline} startFinish={track.startFinish} splits={track.splits} />
      <button onClick={onShowQr} className="w-full flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs">
        <Users className="w-4 h-4 text-accent shrink-0" />
        <span className="flex-1">
          {crew.length ? tr("Pit crew linked: {0}. They have this track.", [crew.map((c) => c.name).join(', ')]) : tr("Pit crew: scan my QR to get this track and live timing.")}
        </span>
        <QrCode className="w-4 h-4 shrink-0" />
      </button>
      <Button className="w-full h-14 text-lg font-bold gap-2" onClick={onReady}>
        <Flag className="w-5 h-5" />{" "}{tr("Ready up")}
      </Button>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 gap-1" onClick={onEdit}>
          <Pencil className="w-4 h-4" />{" "}{tr("Edit lines")}
        </Button>
        <Button
          variant="ghost"
          className={cn('flex-1 gap-1', confirmDelete ? 'text-destructive-foreground bg-destructive' : 'text-destructive')}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
        >
          <Trash2 className="w-4 h-4" /> {confirmDelete ? tr("Tap to delete") : tr("Delete")}
        </Button>
      </div>
    </div>
  );
}

function bestFor(sessions: TrackSession[], trackId: string): number | null {
  let best: number | null = null;
  for (const s of sessions) {
    if (s.trackId !== trackId) continue;
    for (const l of s.laps) if (l.valid && (best === null || l.ms < best)) best = l.ms;
  }
  return best;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border px-1.5 py-1.5', accent ? 'border-[#a78bfa]/60 bg-[#7c3aed]/10' : 'border-border bg-card/50')}>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold tabular-nums text-sm">{value}</p>
    </div>
  );
}

function QrOverlay({ value, crew, onClose }: { value: string; crew: { id: string; name: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] bg-background/95 flex flex-col items-center justify-center gap-3 p-6" onClick={onClose}>
      <p className="text-sm font-semibold">{tr("Pit crew: scan to link")}</p>
      <div className="p-3 rounded-2xl bg-white">
        <QRCodeSVG value={value} size={220} level="M" marginSize={1} />
      </div>
      <p className="text-xs text-muted-foreground">{crew.length ? tr("Linked: {0}", [crew.map((c) => c.name).join(', ')]) : tr("Nobody linked yet")}</p>
      <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground" onClick={onClose}>
        <X className="w-4 h-4" />{" "}{tr("Close")}
      </button>
    </div>
  );
}
