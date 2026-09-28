import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine, Send, Wifi, WifiOff, Download, Footprints, Flag, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { Lap, TrackDef } from '../types';
import { PIT_PRESETS } from '../types';
import { speakRiderCall } from '../lib/pitCalls';
import { TrackLink, parseTrackQr, type LinkMessage, type RacerSnapshot, type Telemetry } from '../lib/link';
import { shareFile } from '../lib/export';
import { DeltaReadout, LapTable, SectorBoxes } from './TimingParts';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';
import { TrackMinimap } from './TrackMinimap';
import { TrackVoice } from './TrackVoice';
import { tr } from '@/lib/i18n';

const SCANNER_ID = 'track-pit-scanner';

/**
 * Pit crew phone: scan the racer's QR and get live timing, a data strip, a
 * track map with the rider's dot, the lap list and a pit board to send
 * messages to the rider.
 */
export function PitView() {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const wakeLock = useWakeLock();
  const [token, setToken] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const linkRef = useRef<TrackLink | null>(null);
  const crewId = useMemo(() => crypto.randomUUID(), []);

  const [snap, setSnap] = useState<RacerSnapshot | null>(null);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [lapStartT, setLapStartT] = useState<number | null>(null);
  const [splits, setSplits] = useState<{ index: number; ms: number }[]>([]);
  const [tele, setTele] = useState<Telemetry | null>(null);
  const [offset, setOffset] = useState(0); // racer clock − local clock
  const [lastSeen, setLastSeen] = useState(0);
  const [ended, setEnded] = useState(false);
  const [custom, setCustom] = useState('');
  const trailRef = useRef<{ lat: number; lng: number }[]>([]);
  const logRef = useRef<Telemetry[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 47);
    return () => clearInterval(id);
  }, []);

  const stopScanner = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    try {
      if (s?.isScanning) await s.stop();
      s?.clear();
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  const scan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const qr = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = qr;
      const edge = Math.min(window.innerWidth, window.innerHeight);
      const box = Math.max(180, Math.round(Math.min(edge * 0.7, 280)));
      await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: box, height: box } }, (decoded) => {
        const t = parseTrackQr(decoded);
        if (!t) return;
        void stopScanner();
        haptics.success();
        setToken(t);
      }, () => {});
    } catch {
      toast.error(tr("Could not access camera"));
      setScanning(false);
    }
  };

  // Connect once we have the racer's key.
  useEffect(() => {
    if (!token) return;
    wakeLock.request();
    const onMsg = (m: LinkMessage) => {
      setLastSeen(Date.now());
      if (m.type === 'state') {
        if (m.snap.running && !snapRef.current?.running) {
          trailRef.current = [];
          setSplits([]);
          setTele(null);
        }
        setSnap(m.snap);
        setLaps(m.snap.laps);
        setLapStartT(m.snap.lapStartT);
        setOffset(m.snap.now - Date.now());
        if (m.snap.phase !== 'idle') setEnded(false);
      } else if (m.type === 'tele') {
        setTele(m.tele);
        setOffset(m.tele.now - Date.now());
        if (m.tele.lapStartT !== null) setLapStartT(m.tele.lapStartT);
        trailRef.current.push({ lat: m.tele.lat, lng: m.tele.lng });
        if (trailRef.current.length > 1500) trailRef.current.shift();
        logRef.current.push(m.tele);
      } else if (m.type === 'split') {
        setSplits((s) => [...s.filter((x) => x.index !== m.index), { index: m.index, ms: m.ms }]);
      } else if (m.type === 'lap') {
        setLaps((l) => [...l.filter((x) => x.n !== m.lap.n), m.lap]);
        setSplits([]);
        haptics.light();
      } else if (m.type === 'pit' && m.msg.from === 'rider') {
        haptics.heavy();
        speakRiderCall(m.msg.text);
        toast.warning(tr("Rider: {0}", [String(m.msg.text).slice(0, 40)]), { duration: 10000 });
      } else if (m.type === 'ended') {
        setEnded(true);
        toast(tr("Session ended by the rider"));
      }
    };
    const link = new TrackLink(token, onMsg);
    linkRef.current = link;
    const hello = () => link.send({ type: 'hello', crewId, name: profile.name || 'Pit crew' });
    const t1 = setTimeout(hello, 400);
    const ping = setInterval(() => {
      // Keep knocking until the racer answers; then only occasionally.
      if (!snapRef.current) hello();
    }, 1500);
    return () => {
      clearTimeout(t1);
      clearInterval(ping);
      link.close();
      linkRef.current = null;
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => () => void stopScanner(), []);

  const sendPit = (text: string) => {
    const t = text.trim().slice(0, 40);
    if (!t || !linkRef.current) return;
    linkRef.current.send({ type: 'pit', msg: { id: crypto.randomUUID(), text: t, at: Date.now(), from: 'crew' } });
    haptics.medium();
    toast.success(tr("Pit board: {0}", [t]));
  };

  const track: TrackDef | null = snap?.track ?? null;
  const sectors = (track?.splits.length ?? 0) + 1;
  const lastLap = laps.length ? laps[laps.length - 1] : null;
  const best = laps.filter((l) => l.valid).reduce<Lap | null>((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const bestBefore = useMemo(() => {
    const valid = laps.filter((l) => l.valid && l.sectors.length === sectors);
    return Array.from({ length: sectors }, (_, i) => Math.min(...valid.map((l) => l.sectors[i]), Infinity));
  }, [laps, sectors]);
  const elapsed = lapStartT !== null && !ended ? Math.max(0, now + offset - lapStartT) : null;
  const live = now - lastSeen < 3000;
  const running = !!snap?.running && !ended;

  if (!token) {
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
        <PageHeader title={tr("Track Pack")} subtitle={tr("Pit crew")} backTo="/" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <ScanLine className="w-12 h-12 text-accent" />
          <p className="text-sm text-muted-foreground max-w-xs">{tr("Scan the QR on your racer's Track Pack screen to get their live timing and a pit board.")}</p>
          <Button onClick={scan} className="h-12 px-6 gap-2">
            <ScanLine className="w-5 h-5" />{" "}{tr("Scan racer QR")}
          </Button>
        </div>
        {scanning && (
          <div className="fixed inset-0 z-[100] bg-background flex flex-col">
            <div className="flex items-center justify-between p-4">
              <p className="font-semibold">{tr("Scan racer QR")}</p>
              <Button variant="ghost" onClick={() => void stopScanner()}>
                {tr("Cancel")}
              </Button>
            </div>
            <div id={SCANNER_ID} className="flex-1" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom gap-3">
      <PageHeader
        title={snap ? snap.riderName : tr("Connecting…")}
        subtitle={track ? tr("{0} · Pit crew", [track.name]) : snap?.phase === 'walking' ? tr("Pacing a new track · Pit crew") : tr("Waiting for the racer")}
        backTo="/"
        right={
          <div className="flex items-center gap-2">
            <TrackVoice linkToken={token} />
            <span className={cn('flex items-center gap-1 text-xs', live ? 'text-[#22c55e]' : 'text-muted-foreground')}>
              {live ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {live ? tr("Live") : ended ? tr("Ended") : tr("No data")}
            </span>
          </div>
        }
      />

      {!running && (
        <IdlePanel snap={snap} ended={ended} />
      )}

      {running && (
      <div className="flex flex-col landscape:flex-row gap-3">
        <div className="flex-1 flex flex-col gap-2">
          <div className="rounded-3xl border-[3px] border-accent bg-card/50 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {tele?.lap ? tr("Lap {0}", [tele.lap]) : snap?.running ? tr("Out lap") : ended ? tr("Session over") : tr("Not started")}
            </p>
            <p className="font-mono font-black tabular-nums text-5xl leading-none mt-1">{elapsed !== null ? formatLap(elapsed) : '0:00.000'}</p>
            <DeltaReadout delta={tele?.delta ?? null} className="text-2xl" />
          </div>
          <SectorBoxes count={sectors} splits={Array.from({ length: sectors }, (_, i) => splits.find((s) => s.index === i)?.ms)} bestBefore={bestBefore} lastLap={lastLap} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Box label={tr("Last")} value={formatLap(lastLap?.ms)} />
            <Box label={tr("Best")} value={formatLap(best?.ms)} accent />
            <Box label={tr("Theoretical")} value={formatLap(theoreticalBest(laps, sectors))} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Box label={getSpeedLabel(settings.speedUnit)} value={tele ? String(formatSpeed(tele.v * 2.23694, settings.speedUnit)) : '—'} />
            <Box label={tr("Lean")} value={tele?.lean != null ? `${Math.round(Math.abs(tele.lean))}°` : '—'} />
            <Box label={tr("G")} value={tele?.g != null ? tele.g.toFixed(2) : '—'} />
          </div>
        </div>
        {track && (
          <TrackMinimap
            className="landscape:w-[40%] aspect-square"
            outline={track.outline ?? trailRef.current}
            lines={track.outline ? [{ points: trailRef.current.slice(-150), color: 'hsl(var(--accent))', width: 0.7 }] : []}
            startFinish={track.startFinish}
            splits={track.splits}
            dot={tele ? { lat: tele.lat, lng: tele.lng } : null}
          />
        )}
      </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{tr("Pit board")}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {PIT_PRESETS.map((p) => (
            <Button key={p} variant="secondary" className="h-10 text-xs font-bold" onClick={() => sendPit(p)} disabled={!snap}>
              {p}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <Input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 40))} placeholder={tr("Custom message (e.g. +0.4)")} className="h-10" />
          <Button
            className="h-10"
            disabled={!snap || !custom.trim()}
            onClick={() => {
              sendPit(custom);
              setCustom('');
            }}
            aria-label={tr("Send pit message")}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {laps.length > 0 && <LapTable laps={laps} sectors={sectors} />}
      {logRef.current.length > 0 && (
        <Button
          variant="ghost"
          className="gap-1 text-xs"
          onClick={() =>
            shareFile(
              `pit-${(track?.name ?? 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
              [
                'time_ms,lap,lap_distance_m,lat,lng,speed_kph,lean_deg,g,delta_ms',
                ...logRef.current.map((x) => [x.t, x.lap, x.d.toFixed(1), x.lat.toFixed(7), x.lng.toFixed(7), (x.v * 3.6).toFixed(1), x.lean?.toFixed(1) ?? '', x.g?.toFixed(2) ?? '', x.delta ?? ''].join(',')),
              ].join('\n'),
              'text/csv',
            )
          }
        >
          <Download className="w-4 h-4" />{" "}{tr("Export what the pit received (CSV)")}
        </Button>
      )}
    </div>
  );
}

function Box({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border px-1.5 py-1.5', accent ? 'border-[#a78bfa]/60 bg-[#7c3aed]/10' : 'border-border bg-card/50')}>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold tabular-nums text-sm">{value}</p>
    </div>
  );
}

/**
 * Before the lights: what the racer is doing right now, as a minimap — the
 * track being paced out, the chosen track with the rider rolling to the grid,
 * or just "waiting".
 */
function IdlePanel({ snap, ended }: { snap: RacerSnapshot | null; ended: boolean }) {
  const phase = snap?.phase ?? 'idle';
  const walk = snap?.walk ?? null;
  const track = snap?.track ?? null;
  const Icon = phase === 'walking' ? Footprints : phase === 'armed' ? Flag : Hourglass;
  const title = !snap
    ? 'Connecting to the racer…'
    : phase === 'walking'
      ? walk?.closed
        ? 'Lap recorded. Racer is placing the timing lines'
        : `Recording a new track · ${Math.round(walk?.travelled ?? 0)} m`
      : phase === 'armed'
        ? 'Racer is ready on the grid. Timing starts at launch'
        : ended
          ? 'Session over. Waiting for the next run'
          : track
            ? `${track.name} selected. Waiting for the racer to ready up`
            : 'Waiting for the racer to pick a track';
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('rounded-2xl border px-3 py-2 flex items-center gap-2', phase === 'armed' ? 'border-accent bg-accent/10 animate-pulse' : 'border-border bg-card/50')}>
        <Icon className="w-5 h-5 text-accent shrink-0" />
        <p className="text-sm font-semibold">{title}</p>
        {snap?.gpsHz ? <span className="ml-auto text-[10px] font-mono text-muted-foreground">{tr("GPS")}{" "}{snap.gpsHz}{" "}{tr("Hz")}</span> : null}
      </div>
      <TrackMinimap
        className="aspect-square max-h-[55dvh] w-full mx-auto landscape:max-w-[55dvh]"
        outline={phase === 'walking' ? undefined : track?.outline}
        lines={phase === 'walking' && walk ? [{ points: walk.trail, color: 'hsl(var(--accent))', width: 1.2 }] : []}
        startFinish={phase === 'walking' ? walk?.startFinish : track?.startFinish}
        splits={phase === 'walking' ? walk?.splits : track?.splits}
        dot={snap?.pos ?? null}
      />
    </div>
  );
}
