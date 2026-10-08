import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Flag, QrCode, Users, Satellite, X, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useNavigate } from 'react-router-dom';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useActiveRide, useRideHistory } from '@/features/ride';
import { useLiveOverlayRecorder } from '@/hooks/useLiveOverlayRecorder';
import { hasServerCap } from '@/lib/serverCaps';
import { saveRideOverlayBlob } from '@/lib/overlayStore';
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
import { hasBoard, lapClock, lapDirection, submitRecord } from '../lib/trackRecords';
import { amendPendingTrackReceipt } from '@/lib/trackReceipt';
import { decodeCard, encodeCard } from '@/features/cards/lib/cardCodec';
import { useSpectreCards, useVehicleCards } from '@/features/cards';
import { WalkScreen } from './WalkScreen';
import { PitLaneCard } from './PitLaneCard';
import { TrackMinimap } from './TrackMinimap';
import { SessionDetail } from './SessionDetail';
import { TrackVoice } from './TrackVoice';
import { postRaceSummary } from './PostRacePicker';
import { DeltaReadout, SectorBoxes } from './TimingParts';
import { tr } from '@/lib/i18n';

export function RacerView() {
  const racer = useRacer();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const { rideState, startRide, endRide, updateLeanAngle, updateGForce } = useActiveRide();
  const { setRideOverlayAvailable } = useRideHistory();
  const navigate = useNavigate();
  const [showQr, setShowQr] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [viewing, setViewing] = useState<TrackSession | null>(null);
  const [flyoverOnOpen, setFlyoverOnOpen] = useState(false);
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
  const { canLean, vehicles } = useExperience();
  const { cards: vehicleCards } = useVehicleCards();
  const { earnSpectre } = useSpectreCards();
  // Cornering G for a leaning bike comes from its speed and turn rate, with lean giving the side (see lib/gForceVector).
  const leanForGRef = useRef<number | null>(null);
  leanForGRef.current = canLean && lean.isSupported && lean.permissionGranted ? lean.currentLean : null;
  const speedForGRef = useRef<number | null>(null);
  speedForGRef.current = sensorsOn && Number.isFinite(racer.speed) ? racer.speed : null;
  const gForce = useGForce(sensorsOn, { leanRef: leanForGRef, speedRef: speedForGRef });
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

  // ── Post-race: what the pit crew asked for, else the rider's own default ──
  const postRace = racer.postRace ?? { results: true, flyover: false, overlay: !!settings.rideOverlayEnabled };
  const accentHsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const overlay = useLiveOverlayRecorder({
    speedUnit: settings.speedUnit,
    distanceUnit: settings.distanceUnit,
    hasLeanData: canLean && lean.isSupported,
    hasGForceData: gForce.isSupported,
    accentColor: `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`,
    blacktopMapEnabled: profile.preferredNavApp === 'blacktop',
  });
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const recordingRef = useRef(false);
  // The overlay video runs from the launch to the end of the session (Track
  // Day figures always show: Public Road Privacy doesn't hide them here).
  useEffect(() => {
    if (phase === 'running' && postRace.overlay && !recordingRef.current) {
      overlayRef.current.startRecording();
      recordingRef.current = true;
    }
  }, [phase, postRace.overlay]);
  const overlayFeed = useRef({ rideState, gForce });
  overlayFeed.current = { rideState, gForce };
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      if (!recordingRef.current) return;
      const { rideState: r, gForce: g } = overlayFeed.current;
      const last = r.gpsPoints[r.gpsPoints.length - 1];
      const prev = r.gpsPoints[r.gpsPoints.length - 2];
      let heading: number | null = null;
      if (last && prev) {
        const rad = Math.PI / 180;
        const y = Math.sin((last.lng - prev.lng) * rad) * Math.cos(last.lat * rad);
        const x = Math.cos(prev.lat * rad) * Math.sin(last.lat * rad) - Math.sin(prev.lat * rad) * Math.cos(last.lat * rad) * Math.cos((last.lng - prev.lng) * rad);
        heading = ((Math.atan2(y, x) / rad) + 360) % 360;
      }
      overlayRef.current.updateStats({
        speed: r.currentSpeed,
        maxSpeed: r.maxSpeed,
        distance: r.distance,
        duration: r.duration,
        leanAngle: r.currentLean,
        maxLean: Math.max(r.maxLeanLeft, r.maxLeanRight),
        gForce: g.currentG,
        gVector: g.isSupported ? { lateral: g.lateralG, longitudinal: g.longitudinalG, envelope: r.gEnvelope ?? g.envelope, max: r.gMax ?? g.gMax } : undefined,
        maxGForce: r.maxGForce,
        lat: last?.lat ?? null,
        lng: last?.lng ?? null,
        heading,
      });
    }, 200);
    return () => clearInterval(id);
  }, [phase]);
  // Leaving Track Day mid-session drops the video.
  useEffect(
    () => () => {
      if (recordingRef.current) void overlayRef.current.stopRecording();
    },
    [],
  );

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
    const raced = racer.track;
    const wantFlyover = postRace.flyover;
    const video = recordingRef.current ? overlayRef.current.stopRecording() : Promise.resolve(null);
    recordingRef.current = false;
    const session = endSession(getActiveBikeIdSnapshot() ?? undefined);
    setConfirmEnd(false);
    // Opted-in riders on a library circuit: the record lap goes on its board
    // before the ride closes, so the receipt has the dog tags and the rank.
    if (session && raced && settings.trackLeaderboardsEnabled && hasServerCap('trackRecords') && hasBoard(raced)) {
      const vehicleCard = vehicleCards.find((c) => c.bike.id === getActiveBikeIdSnapshot()) ?? vehicleCards[0];
      const result = await submitRecord({
        track: raced,
        session,
        vehicleClass: vehicles[0] ?? 'motorcycle',
        displayName: riderName,
        vehicleName: vehicleCard?.bike.name ?? null,
        card: vehicleCard ? decodeCard(encodeCard(vehicleCard, riderName)) : null,
      }).catch(() => null);
      if (result) {
        for (const b of result.beaten) {
          if (!b.card) continue;
          earnSpectre({
            key: `track-${raced.osmId}-${lapDirection(raced.outline)}-${vehicles[0] ?? 'motorcycle'}-${b.display_name}`,
            card: b.card,
            setterName: b.display_name,
            track: raced.name,
            timeSec: result.lap.ms / 1000,
            targetSec: b.lap_ms / 1000,
          });
        }
        const tags = result.beaten.length;
        amendPendingTrackReceipt({ dogTags: tags, rank: result.rank, badges: Array.from({ length: tags * 3 }, () => 'speed-demon' as const) });
        if (tags || result.rank) {
          toast.success(
            tags ? (tags === 1 ? tr("1 dog tag collected") : tr("{0} dog tags collected", [tags])) : tr("On the board"),
            { description: result.rank ? tr("{0}: P{1} with {2}", [raced.name, result.rank, lapClock(result.lap.ms)]) : undefined },
          );
        }
      }
    }
    const rideId = await endRide();
    setFlyoverOnOpen(wantFlyover);
    setViewing(session);
    haptics.success();
    const blob = await video.catch(() => null);
    if (blob && rideId) {
      try {
        await saveRideOverlayBlob(rideId, blob);
        setRideOverlayAvailable(rideId, true);
        toast.success(tr("Overlay video ready"), {
          description: tr("It's saved with this session's ride in History."),
          duration: 15000,
          action: { label: tr("Share"), onClick: () => navigate(`/ride/${rideId}`) },
        });
      } catch {
        toast.error(tr("Failed to save overlay"));
      }
    }
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


  if (viewing) return <SessionDetail session={viewing} autoFlyover={flyoverOnOpen} onBack={() => { setViewing(null); setFlyoverOnOpen(false); }} />;

  // ── Recording a lap to create a track (then placing its lines) ───────────
  if (phase === 'walking') return <WalkScreen header={statusBar} overlay={qrOverlay} />;

  // ── On the grid: waiting for the launch ──────────────────────────────────
  if (phase === 'armed' && track) {
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
        {statusBar}
        <TrackMinimap className="aspect-square max-h-[40dvh] mx-auto w-full" outline={track.outline} startFinish={track.startFinish} splits={track.splits} pitLane={track.pitLane} startFinishPits={track.startFinishPits} />
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
          {(racer.postRace || postRace.overlay) && (
            <p className="text-[11px] text-muted-foreground max-w-xs">
              {racer.postRace ? tr("Your pit crew wants: {0}", [postRaceSummary(racer.postRace)]) : tr("Recording the overlay video from the launch")}
            </p>
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
        {racer.pitLane && <PitLaneCard live={racer.pitLane} speed={racer.speed} limit={racer.pitLimit} now={now} big />}
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
          <button onClick={dismissPit} className="fixed inset-0 z-[100] safe-frame flex flex-col items-center justify-center bg-black">
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
    <div className="fixed inset-0 z-[90] safe-frame bg-background/95 flex flex-col items-center gap-3 p-6 overflow-y-auto [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto" onClick={onClose}>
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
