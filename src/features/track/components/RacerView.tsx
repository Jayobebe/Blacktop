import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Flag, Trash2, Pencil, QrCode, Users, Satellite, X, Footprints, Map as MapIcon, Split, Check, Timer, History } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useActiveRide } from '@/features/ride';
import { getActiveBikeIdSnapshot } from '@/features/garage';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useLeanAngle } from '@/hooks/useLeanAngle';
import { useGForce } from '@/hooks/useGForce';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { TrackDef, TrackSession } from '../types';
import { RIDER_CALLS } from '../types';
import { deleteTrack, saveTrack, useTrackStore } from '../lib/trackStore';
import { TRACK_QR_PREFIX } from '../lib/link';
import {
  armTrack,
  cancelWalk,
  closeRacerLink,
  confirmTrack,
  disarm,
  dismissPit,
  endSession,
  launchNow,
  markSplit,
  markStartFinish,
  openRacerLink,
  sendRiderCall,
  startWalk,
  updateSensors,
  useRacer,
} from '../lib/session';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';
import { TrackEditor } from './TrackEditor';
import { TrackMinimap } from './TrackMinimap';
import { SessionDetail } from './SessionDetail';
import { TrackVoice } from './TrackVoice';
import { DeltaReadout, SectorBoxes } from './TimingParts';

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
  const [trackName, setTrackName] = useState('');
  const riderName = profile.name || 'Racer';

  const { phase } = racer;
  const sensorsOn = phase === 'armed' || phase === 'running';
  const lean = useLeanAngle(sensorsOn);
  const gForce = useGForce(sensorsOn);
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
    updateSensors(lean.currentLean, gForce.currentG);
    if (phase === 'running') {
      if (lean.isSupported) updateLeanAngle(lean.currentLean, lean.maxLeanLeft, lean.maxLeanRight);
      if (gForce.isSupported) updateGForce(gForce.currentG, gForce.maxG);
    }
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
      toast.error('Finish your current ride first');
      return;
    }
    haptics.medium();
    await Promise.all([lean.requestPermission?.(), gForce.requestPermission?.()]).catch(() => {});
    armTrack(t, riderName, () => {
      // The ride (history + totals) starts with the launch.
      if (!startRide(false)) toast.error('Location is needed for the ride log');
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
      <span className="font-semibold truncate">{phase === 'walking' ? 'New track' : track?.name}</span>
      <span className={cn('ml-auto flex items-center gap-1 font-mono', gpsTone)} title="GPS fixes per second">
        <Satellite className="w-3.5 h-3.5" /> {racer.gpsHz || '–'} Hz
      </span>
      <TrackVoice linkToken={racer.token} />
      <button onClick={() => setShowQr(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border" aria-label="Pit crew QR">
        <Users className="w-3.5 h-3.5" /> {racer.crew.length}
      </button>
    </div>
  );
  const qrOverlay = showQr && qrValue && <QrOverlay value={qrValue} crew={racer.crew} onClose={() => setShowQr(false)} />;

  if (editing) {
    return (
      <TrackEditor
        initial={editing === 'new' ? undefined : editing}
        onCancel={() => setEditing(null)}
        onSave={(t) => {
          saveTrack(t);
          setEditing(null);
          toast.success(`${t.name} saved`);
        }}
      />
    );
  }

  if (viewing) return <SessionDetail session={viewing} onBack={() => setViewing(null)} />;

  // ── Walking / riding a lap to create a track ─────────────────────────────
  if (phase === 'walking' && racer.walk) {
    const w = racer.walk;
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-3">
        {statusBar}
        <TrackMinimap
          className="flex-1 min-h-[240px]"
          lines={[{ points: w.trail, color: 'hsl(var(--accent))', width: 1.4 }]}
          startFinish={w.startFinish}
          splits={w.splits}
          dot={w.trail[w.trail.length - 1] ?? null}
        />
        <p className="text-center text-xs text-muted-foreground">
          {!w.startFinish
            ? 'Stand at the start/finish facing the way you race, start moving, and tap the button as you cross the line.'
            : racer.canClose
              ? 'Back at the start/finish. Confirm to finish the track.'
              : `Walk or ride the lap. Tap Sector wherever you want a split. ${Math.round(w.travelled)} m · ${w.splits.length + 1} sectors`}
        </p>
        {!w.startFinish ? (
          <Button
            className="h-16 text-lg font-bold gap-2"
            onClick={() => {
              if (!markStartFinish()) toast('Keep moving a few metres so the line can be squared to the track');
            }}
          >
            <Flag className="w-5 h-5" /> Set start/finish line here
          </Button>
        ) : racer.canClose ? (
          <div className="space-y-2">
            <Input value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder="Track name" maxLength={40} />
            <Button
              className="w-full h-16 text-lg font-bold gap-2"
              onClick={() => {
                const t = confirmTrack(trackName);
                if (t) {
                  toast.success(`${t.name} saved`, { description: `${t.splits.length + 1} sectors` });
                  setTrackName('');
                }
              }}
            >
              <Check className="w-5 h-5" /> Confirm start/finish line
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="h-16 text-lg font-bold gap-2 border-2 border-[#a855f7]"
            onClick={() => {
              if (!markSplit()) toast('Keep moving so the line can be squared to the track');
            }}
          >
            <Split className="w-5 h-5" /> Sector here ({w.splits.length + 1})
          </Button>
        )}
        <Button variant="ghost" onClick={cancelWalk}>
          Cancel
        </Button>
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
          <p className="text-lg font-bold">Get into position</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Timing starts by itself the moment you launch. On the start/finish line, lap 1 starts with you; from behind it, at the line.
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            GPS {racer.gpsHz || '–'} Hz · ±{racer.gpsAccuracy != null ? Math.round(racer.gpsAccuracy) : '–'} m
          </p>
        </div>
        <Button variant="secondary" onClick={launchNow}>
          Start timing now (rolling start)
        </Button>
        <Button variant="ghost" onClick={disarm}>
          Cancel
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
              {racer.lapNumber === 0 ? 'Out lap' : `Lap ${racer.lapNumber}`}
            </p>
            <p className="font-mono font-black tabular-nums text-6xl landscape:text-5xl leading-none mt-1">{elapsed !== null ? formatLap(elapsed) : '0:00.000'}</p>
            <DeltaReadout delta={racer.delta} className="text-3xl mt-2" />
            <p className="text-[10px] text-muted-foreground">vs best</p>
          </div>
          <div className="landscape:w-[45%] flex flex-col gap-2">
            <SectorBoxes count={sectors} splits={racer.splits.map((s) => s.ms)} bestBefore={bestBefore} lastLap={lastLap} big />
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Last" value={formatLap(lastLap?.ms)} />
              <Stat label="Best" value={formatLap(racer.bestLap?.ms)} accent />
              <Stat label="Theoretical" value={formatLap(theo)} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={getSpeedLabel(settings.speedUnit)} value={String(formatSpeed(racer.speed * 2.23694, settings.speedUnit))} />
              <Stat label="Lean" value={lean.isSupported ? `${Math.round(Math.abs(racer.lean))}°` : '—'} />
              <Stat label="G" value={gForce.isSupported ? racer.g.toFixed(2) : '—'} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {RIDER_CALLS.map((c) => (
            <Button key={c} variant="secondary" className="h-11 text-xs" onClick={() => sendRiderCall(c)} disabled={racer.crew.length === 0}>
              {c}
            </Button>
          ))}
        </div>
        <Button variant="outline" className={cn('h-12 border-2', confirmEnd ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-destructive/60 text-destructive')} onClick={end}>
          <Flag className="w-4 h-4 mr-2" /> {confirmEnd ? 'Tap again to end the session' : 'End session'}
        </Button>

        {racer.pit && (
          <button onClick={dismissPit} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
            <div className="absolute inset-3 rounded-3xl border-[6px] border-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-accent">Pit board</span>
            <span className="mt-2 text-8xl font-black tracking-tight text-center px-4 leading-none text-white">{racer.pit.text}</span>
            <span className="mt-6 text-xs text-white/60">Tap to dismiss</span>
          </button>
        )}
        {qrOverlay}
      </div>
    );
  }

  // ── Track Pack home: pairing, tracks, sessions ───────────────────────────
  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader title="Track Pack" subtitle="Racer" backTo="/" right={<TrackVoice linkToken={racer.token} />} />

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-3">
        {qrValue ? (
          <button onClick={() => setShowQr(true)} className="p-1.5 rounded-lg bg-white shrink-0" aria-label="Show pit crew QR larger">
            <QRCodeSVG value={qrValue} size={72} level="M" marginSize={0} />
          </button>
        ) : (
          <div className="w-[84px] h-[84px] rounded-lg bg-muted animate-pulse shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-accent" /> Pit crew
          </p>
          <p className="text-xs text-muted-foreground">Track Pack → Pit crew → scan. They can join now or any time.</p>
          <p className="text-xs mt-0.5">{racer.crew.length ? `Linked: ${racer.crew.map((c) => c.name).join(', ')}` : 'Nobody linked yet'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-14 gap-2" onClick={() => startWalk(riderName)}>
          <Footprints className="w-5 h-5" /> Walk a new track
        </Button>
        <Button variant="secondary" className="h-14 gap-2" onClick={() => setEditing('new')}>
          <MapIcon className="w-5 h-5" /> Draw on map
        </Button>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Tracks · tap to get on the grid</p>
        {tracks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tracks yet. Walk or ride one lap to create it.</p>
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 p-2">
                <button onClick={() => arm(t)} className="flex-1 flex items-center gap-3 text-left">
                  <TrackMinimap className="w-14 h-14 p-1 shrink-0" outline={t.outline} startFinish={t.startFinish} splits={t.splits} />
                  <span>
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.splits.length + 1} sectors · best {formatLap(bestFor(sessions, t.id))}
                    </span>
                  </span>
                </button>
                <button onClick={() => setEditing(t)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted" aria-label={`Edit ${t.name}`}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    deleteTrack(t.id);
                    toast(`${t.name} deleted`);
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
            <History className="w-3 h-3" /> Sessions
          </p>
          <div className="space-y-1.5">
            {sessions.slice(0, 12).map((s) => {
              const best = s.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0];
              return (
                <button key={s.id} onClick={() => setViewing(s)} className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 px-3 py-2 text-left">
                  <span>
                    <span className="block text-sm font-medium">{s.trackName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {s.laps.length} laps
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
      <p className="text-sm font-semibold">Pit crew: scan to link</p>
      <div className="p-3 rounded-2xl bg-white">
        <QRCodeSVG value={value} size={220} level="M" marginSize={1} />
      </div>
      <p className="text-xs text-muted-foreground">{crew.length ? `Linked: ${crew.map((c) => c.name).join(', ')}` : 'Nobody linked yet'}</p>
      <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground" onClick={onClose}>
        <X className="w-4 h-4" /> Close
      </button>
    </div>
  );
}
