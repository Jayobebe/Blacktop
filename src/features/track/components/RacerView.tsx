import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Flag, QrCode, Users, Satellite, X, Timer } from 'lucide-react';
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
import { markTrackUsed } from '../lib/trackStore';
import { TRACK_QR_PREFIX, parsePitQr } from '../lib/link';
import {
  armTrack,
  confirmInPosition,
  closeRacerLink,
  disarm,
  dismissPit,
  endSession,
  joinPitLink,
  setTrackFromCrewHandler,
  launchNow,
  openRacerLink,
  selectTrack,
  sendRiderCall,
  startWalk,
  updateSensors,
  useRacer,
} from '../lib/session';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';
import { TrackHome } from './TrackHome';
import { WalkScreen } from './WalkScreen';
import { TrackMinimap } from './TrackMinimap';
import { SessionDetail } from './SessionDetail';
import { TrackVoice } from './TrackVoice';
import { DeltaReadout, SectorBoxes } from './TimingParts';
import { tr } from '@/lib/i18n';

export function RacerView() {
  const racer = useRacer();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const { rideState, startRide, endRide, updateLeanAngle, updateGForce } = useActiveRide();
  const [showQr, setShowQr] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [viewing, setViewing] = useState<TrackSession | null>(null);
  const riderName = profile.name || 'Racer';

  // The pit crew set the track (their QR): it arrives selected, ready to go to the grid.
  useEffect(() => {
    setTrackFromCrewHandler((t) => {
      toast.success(tr("Your pit crew set {0}", [t.name]), { description: tr("Ready up when you're on the grid.") });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return () => setTrackFromCrewHandler(null);
  }, []);

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


  if (viewing) return <SessionDetail session={viewing} onBack={() => setViewing(null)} />;

  // ── Recording a lap to create a track (then placing its lines) ───────────
  if (phase === 'walking') return <WalkScreen header={statusBar} overlay={qrOverlay} />;

  // ── On the grid: waiting for the launch ──────────────────────────────────
  if (phase === 'armed' && track) {
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
        {statusBar}
        <TrackMinimap className="aspect-square max-h-[40dvh] mx-auto w-full" outline={track.outline} startFinish={track.startFinish} splits={track.splits} />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <div className={cn('w-24 h-24 rounded-full border-4 flex items-center justify-center', racer.inPosition ? 'border-accent animate-pulse' : 'border-border')}>
            <Timer className={cn('w-10 h-10', racer.inPosition ? 'text-accent' : 'text-muted-foreground')} />
          </div>
          {racer.inPosition ? (
            <>
              <p className="text-lg font-bold">{tr("In position")}</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {tr("Timing starts by itself the moment you launch. On the start/finish line, lap 1 starts with you; from behind it, at the line.")}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold">{tr("Head to the grid")}</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {tr("Nothing is timed on the way, so riding out of the pits won't start the clock. Tap I'm in position once you're on the grid.")}
              </p>
            </>
          )}
          <p className="text-[11px] font-mono text-muted-foreground">
            {tr("GPS")}{" "}{racer.gpsHz || '–'}{" "}{tr("Hz · ±")}{racer.gpsAccuracy != null ? Math.round(racer.gpsAccuracy) : '–'}{" "}{tr("m")}
          </p>
        </div>
        {!racer.inPosition && (
          <Button className="h-16 text-lg font-bold" onClick={confirmInPosition}>
            <Flag className="w-5 h-5 mr-2" />
            {tr("I'm in position")}
          </Button>
        )}
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
                <GForceCircle lateral={gForce.lateralG} longitudinal={gForce.longitudinalG} envelope={gForce.envelope} max={gForce.gMax} className="w-36 landscape:w-32" />
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

  // ── Track Day home (shared with the pit crew: components/TrackHome) ──────
  return (
    <>
      <TrackHome
        role="racer"
        headerRight={
          <div className="flex items-center gap-1.5">
            <TrackVoice linkToken={racer.token} />
            <button onClick={() => setShowQr(true)} className="flex items-center gap-1 h-9 px-2.5 rounded-xl frost-accent text-xs" aria-label={tr("Pit crew QR")}>
              <QrCode className="w-4 h-4" /> {racer.crew.length}
            </button>
          </div>
        }
        selected={phase === 'idle' ? track : null}
        onSelect={selectTrack}
        onWalk={() => startWalk(riderName)}
        scan={{
          label: tr("Scan pit crew QR"),
          hint: tr("Scan the QR on your pit crew's Track Day screen. They send you the track they set up."),
          read: (text) => {
            const token = parsePitQr(text);
            if (!token) return false;
            if (joinPitLink(token)) toast.success(tr("Joined your pit crew"), { description: tr("Their track arrives in a moment.") });
            return true;
          },
        }}
        primary={{ label: tr("Ready up"), icon: <Flag className="w-5 h-5" />, onClick: (t) => void arm(t) }}
        linkLine={{
          text: racer.crew.length
            ? tr("Pit crew linked: {0}. They have this track.", [racer.crew.map((c) => c.name).join(', ')])
            : tr("Pit crew: scan my QR to get this track and live timing."),
          onClick: () => setShowQr(true),
        }}
        onViewSession={setViewing}
      />
      {qrOverlay}
    </>
  );
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
