import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Plus, Flag, Trash2, Pencil, QrCode, Users, Satellite, X, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
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
import { closeRacerLink, dismissPit, endSession, openRacerLink, sendRiderCall, startSession, updateSensors, useRacer } from '../lib/session';
import { fileStem, lapsCsv, sessionCsv, sessionGpx, shareFile } from '../lib/export';
import { TrackEditor } from './TrackEditor';
import { DeltaReadout, LapTable, SectorBoxes } from './TimingParts';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';

export function RacerView() {
  const navigate = useNavigate();
  const racer = useRacer();
  const { tracks } = useTrackStore();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const { rideState, startRide, endRide, updateLeanAngle, updateGForce } = useActiveRide();
  const [editing, setEditing] = useState<TrackDef | 'new' | null>(null);
  const [selected, setSelected] = useState<TrackDef | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [finished, setFinished] = useState<TrackSession | null>(null);
  const riderName = profile.name || 'Racer';

  const running = racer.phase === 'running';
  const lean = useLeanAngle(running);
  const gForce = useGForce(running);
  const wakeLock = useWakeLock();

  // A session in progress (e.g. after reload) resumes on its track.
  const track = running ? racer.track : selected;

  useEffect(() => {
    if (!running) return;
    wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Feed lean / G into the timer (and the ride, so its stats have them too).
  useEffect(() => {
    if (!running) return;
    updateSensors(lean.currentLean, gForce.currentG);
    if (lean.isSupported) updateLeanAngle(lean.currentLean, lean.maxLeanLeft, lean.maxLeanRight);
    if (gForce.isSupported) updateGForce(gForce.currentG, gForce.maxG);
  }, [running, lean.currentLean, lean.maxLeanLeft, lean.maxLeanRight, lean.isSupported, gForce.currentG, gForce.maxG, gForce.isSupported, updateLeanAngle, updateGForce]);

  // Leaving before starting drops the pairing link.
  useEffect(() => () => closeRacerLink(), []);

  // Auto-hide a pit board after a while.
  useEffect(() => {
    if (!racer.pit) return;
    const t = setTimeout(dismissPit, 8000);
    return () => clearTimeout(t);
  }, [racer.pit]);

  // Running clock.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 47);
    return () => clearInterval(id);
  }, [running]);

  const choose = (t: TrackDef) => {
    setSelected(t);
    openRacerLink(t, riderName);
  };

  const start = async () => {
    if (!track) return;
    if (rideState.isActive && !running) {
      toast.error('Finish your current ride first');
      return;
    }
    haptics.medium();
    await Promise.all([lean.requestPermission?.(), gForce.requestPermission?.()]).catch(() => {});
    if (!rideState.isActive && !startRide(false)) {
      toast.error('Location is needed for timing');
      return;
    }
    startSession(track, riderName);
    toast.success('Timing armed', { description: 'Cross the start / finish line to begin your first lap.' });
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
    setFinished(session);
    haptics.success();
  };

  const sectors = (track?.splits.length ?? 0) + 1;
  const lastLap = racer.laps.length ? racer.laps[racer.laps.length - 1] : null;
  const bestBefore = useMemo(() => racer.bestSectors, [racer.bestSectors]);
  const elapsed = racer.lapStartT !== null ? Math.max(0, now - racer.lapStartT) : null;
  const theo = theoreticalBest(racer.laps, sectors);
  const gpsTone = racer.gpsHz >= 5 ? 'text-[#22c55e]' : racer.gpsHz >= 2 ? 'text-warning' : 'text-destructive';
  const qrValue = racer.token ? TRACK_QR_PREFIX + racer.token : null;

  if (editing) {
    return (
      <TrackEditor
        initial={editing === 'new' ? undefined : editing}
        onCancel={() => setEditing(null)}
        onSave={(t) => {
          saveTrack(t);
          setEditing(null);
          choose(t);
          toast.success(`${t.name} saved`);
        }}
      />
    );
  }

  // ── Session summary ───────────────────────────────────────────────────────
  if (finished) {
    const best = finished.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0];
    const s = finished.splitsCount + 1;
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
        <PageHeader title="Session done" subtitle={finished.trackName} backTo="/" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Best lap" value={formatLap(best?.ms)} accent />
          <Stat label="Theoretical" value={formatLap(theoreticalBest(finished.laps, s))} />
          <Stat label="Laps" value={String(finished.laps.length)} />
        </div>
        <LapTable laps={finished.laps} sectors={s} />
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(finished)}-laps.csv`, lapsCsv(finished), 'text/csv')}>
            <FileText className="w-4 h-4" /> Laps CSV
          </Button>
          <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(finished)}.csv`, sessionCsv(finished), 'text/csv')}>
            <Download className="w-4 h-4" /> Data CSV
          </Button>
          <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(finished)}.gpx`, sessionGpx(finished), 'application/gpx+xml')}>
            <Download className="w-4 h-4" /> GPX
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">Saved to your ride history and totals.</p>
        <Button onClick={() => navigate('/')}>Done</Button>
      </div>
    );
  }

  // ── Live timing ───────────────────────────────────────────────────────────
  if (running && track) {
    return (
      <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom gap-3 bg-background">
        <div className="flex items-center gap-2 text-xs">
          <Zap className="w-4 h-4 text-accent" />
          <span className="font-semibold truncate">{track.name}</span>
          <span className="text-muted-foreground">· {racer.lapNumber === 0 ? 'Out lap' : `Lap ${racer.lapNumber}`}</span>
          <span className={cn('ml-auto flex items-center gap-1 font-mono', gpsTone)} title="GPS fixes per second">
            <Satellite className="w-3.5 h-3.5" /> {racer.gpsHz || '–'} Hz
          </span>
          <button onClick={() => setShowQr(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border">
            <Users className="w-3.5 h-3.5" /> {racer.crew.length}
          </button>
        </div>

        <div className="flex-1 flex flex-col landscape:flex-row gap-3">
          <div className="flex-1 flex flex-col justify-center items-center rounded-3xl border-[3px] border-accent bg-card/50 py-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{racer.lapNumber === 0 ? 'Waiting for the line' : 'Current lap'}</p>
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
          <button
            onClick={dismissPit}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
          >
            <div className="absolute inset-3 rounded-3xl border-[6px] border-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-accent">Pit board</span>
            <span className="mt-2 text-8xl font-black tracking-tight text-center px-4 leading-none text-white">{racer.pit.text}</span>
            <span className="mt-6 text-xs opacity-70">Tap to dismiss</span>
          </button>
        )}
        {showQr && qrValue && <QrOverlay value={qrValue} crew={racer.crew} onClose={() => setShowQr(false)} />}
      </div>
    );
  }

  // ── Track choice + ready ─────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader
        title="Track Pack"
        subtitle="Racer"
        backTo="/"
        right={
          <HeaderButton onClick={() => setEditing('new')} aria-label="New track">
            <Plus className="w-5 h-5" />
          </HeaderButton>
        }
      />

      {!track ? (
        <>
          <p className="text-xs text-muted-foreground">Pick a track, or draw a new one: a start / finish line and optional sector lines.</p>
          {tracks.length === 0 ? (
            <Button onClick={() => setEditing('new')} className="gap-2 h-14">
              <Plus className="w-5 h-5" /> Draw your first track
            </Button>
          ) : (
            <div className="space-y-2">
              {tracks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 p-3">
                  <button onClick={() => choose(t)} className="flex-1 text-left">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.splits.length + 1} sectors</p>
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
        </>
      ) : (
        <>
          <div className="rounded-2xl border-[3px] border-accent bg-card/50 p-4 text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Track</p>
            <p className="text-xl font-bold">{track.name}</p>
            <p className="text-xs text-muted-foreground">{track.splits.length + 1} sectors</p>
            <button onClick={() => setSelected(null)} className="mt-1 text-[11px] text-accent">
              Change track
            </button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" /> Pit crew: Track Pack → Pit crew → scan
            </p>
            {qrValue ? (
              <div className="p-3 rounded-2xl bg-white">
                <QRCodeSVG value={qrValue} size={180} level="M" marginSize={1} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Connecting…</p>
            )}
            <p className="text-xs">
              {racer.crew.length === 0 ? 'No pit crew linked yet (optional)' : `Linked: ${racer.crew.map((c) => c.name).join(', ')}`}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Mount the phone securely. The screen stays on and GPS runs at the fastest rate your phone allows.
          </p>
          <Button onClick={start} className="h-14 text-lg font-bold gap-2 mt-auto">
            <Zap className="w-5 h-5" /> Start session
          </Button>
        </>
      )}
    </div>
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
