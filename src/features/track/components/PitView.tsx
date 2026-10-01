import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Wifi, WifiOff, Download, Footprints, Flag, Hourglass, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
import type { Lap, TrackDef, TrackSession } from '../types';
import { PIT_PRESETS } from '../types';
import { speakRiderCall, pitLabel } from '../lib/pitCalls';
import { PIT_QR_PREFIX, TrackLink, newLinkToken, parseCrewSession, parseTrackQr, type LinkMessage, type RacerSnapshot, type Telemetry } from '../lib/link';
import { markTrackUsed, saveSession } from '../lib/trackStore';
import { TrackHome } from './TrackHome';
import { PitLaneCard, PitStopLine } from './PitLaneCard';
import { WalkScreen } from './WalkScreen';
import { SessionDetail } from './SessionDetail';
import { closeRacerLink, startWalk, useRacer } from '../lib/session';
import { shareFile } from '../lib/export';
import { DeltaReadout, LapTable, SectorBoxes } from './TimingParts';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';
import { TrackMinimap } from './TrackMinimap';
import { TrackVoice } from './TrackVoice';
import { tr } from '@/lib/i18n';

/**
 * Pit crew phone: scan the racer's QR, or set up the track and show the
 * crew's own QR for the racer to scan (they're sent the track, then ride to
 * the grid). Either way: live timing, a data strip, a track map with the
 * rider's dot, the lap list and a pit board to send messages to the rider.
 */
export function PitView() {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const wakeLock = useWakeLock();
  const [token, setToken] = useState<string | null>(null);
  /** The crew set up this track (crew-hosted link): sent to the racer when they join. */
  const [hostTrack, setHostTrack] = useState<TrackDef | null>(null);
  /** The track picked on this phone's Track Day home. */
  const [selected, setSelected] = useState<TrackDef | null>(null);
  const [viewing, setViewing] = useState<TrackSession | null>(null);
  /** The racer's session, sent at the end (results card and flyover). */
  const [received, setReceived] = useState<TrackSession | null>(null);
  const sessionParts = useRef<Record<string, string[]>>({});
  // Building a track with a GPS lap uses the racer's recorder on this phone.
  const walker = useRacer();
  /** The racer has the crew's track (they may pick another after; it isn't pushed again). */
  const delivered = useRef(false);
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
        toast.warning(tr("Rider: {0}", [pitLabel(String(m.msg.text).slice(0, 40))]), { duration: 10000 });
      } else if (m.type === 'session') {
        // The racer's whole session, in parts: kept on this phone once complete.
        const parts = (sessionParts.current[m.id] ??= []);
        if (typeof m.data === 'string' && m.part >= 0 && m.part < Math.min(m.parts, 200)) parts[m.part] = m.data;
        if (parts.filter((x) => x !== undefined).length === m.parts) {
          delete sessionParts.current[m.id];
          const got = parseCrewSession(parts.join(''));
          if (got) {
            saveSession(got);
            setReceived(got);
            haptics.success();
            toast.success(tr("Session results in"), { description: tr("Laps, pit stops and the 3D flyover are ready.") });
          }
        }
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

  // A GPS lap recorded here opened the recorder's link: close it once done.
  useEffect(() => {
    if (walker.phase === 'idle' && walker.token) closeRacerLink();
  }, [walker.phase, walker.token]);

  // Crew-hosted: keep offering the track until the racer's state shows they have it.
  useEffect(() => {
    if (!token || !hostTrack) return;
    delivered.current = false;
    const offer = () => {
      const s = snapRef.current;
      if (s?.track?.id === hostTrack.id) delivered.current = true;
      if (delivered.current || (s && s.phase !== 'idle')) return;
      linkRef.current?.send({ type: 'track', track: hostTrack });
    };
    const id = setInterval(offer, 1500);
    return () => clearInterval(id);
  }, [token, hostTrack]);

  const host = (t: TrackDef) => {
    markTrackUsed(t.id);
    setHostTrack(t);
    setToken(newLinkToken());
  };
  /** Back to the home screen with this track still selected. */
  const changeTrack = () => {
    setToken(null);
    setHostTrack(null);
    setSnap(null);
  };

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

  if (!token && walker.phase === 'walking') return <WalkScreen onSaved={setSelected} />;
  if (viewing) return <SessionDetail session={viewing} onBack={() => setViewing(null)} />;

  // Crew-hosted, before the racer joins: the crew's QR and the track it carries.
  if (token && hostTrack && !snap) {
    return (
      <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
        <PageHeader title={hostTrack.name} subtitle={tr("Pit crew")} onBack={() => setToken(null)} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={PIT_QR_PREFIX + token} size={220} />
          </div>
          <p className="text-sm font-semibold">{tr("Racer: scan this from Track Day")}</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {tr("On their Track Day screen, Scan pit crew QR. They get {0}, then tap I'm in position once they're on the grid.", [hostTrack.name])}
          </p>
          <TrackMinimap className="w-40 h-40" outline={hostTrack.outline} startFinish={hostTrack.startFinish} splits={hostTrack.splits} pitLane={hostTrack.pitLane} startFinishPits={hostTrack.startFinishPits} />
        </div>
        <Button variant="outline" className="h-12 gap-2" onClick={changeTrack}>
          <RefreshCw className="w-4 h-4" />{" "}{tr("Change track")}
        </Button>
      </div>
    );
  }

  // Track Day home, the same as the racer's: scan their QR, or pick a track and show them yours.
  if (!token) {
    return (
      <TrackHome
        role="pit"
        selected={selected}
        onSelect={setSelected}
        onWalk={() => startWalk(profile.name || 'Pit crew')}
        scan={{
          label: tr("Scan racer QR"),
          hint: tr("Scan the QR on your racer's Track Day screen to get their live timing and a pit board."),
          read: (text) => {
            const t = parseTrackQr(text);
            if (!t) return false;
            setToken(t);
            return true;
          },
        }}
        primary={{ label: tr("Show racer QR"), icon: <QrCode className="w-5 h-5" />, onClick: host }}
        onViewSession={setViewing}
      />
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
      {!running && received && (
        <Button className="h-14 text-base font-bold gap-2" onClick={() => setViewing(received)}>
          <Flag className="w-5 h-5" />{" "}{tr("View results and 3D flyover")}
        </Button>
      )}

      {/* Pit lane: live while the racer's in it, the limit the crew sets, and the stops so far. */}
      {running && tele?.pit && <PitLaneCard live={tele.pit} speed={tele.v} limit={tele.pit.limit} now={now + offset} />}
      {snap?.pitTiming && snap.pitLimit != null && (
        <PitLimitControl
          limit={snap.pitLimit}
          onChange={(mps) => linkRef.current?.send({ type: 'pitLimit', mps })}
        />
      )}
      {!!snap?.pitStops?.length && (
        <div className="space-y-1.5">
          {snap.pitStops.map((st) => (
            <PitStopLine key={st.n} stop={st} />
          ))}
        </div>
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
              {pitLabel(p)}
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
/** The pit lane speed limit, set by the crew in their own units (steps of 5). */
function PitLimitControl({ limit, onChange }: { limit: number; onChange: (mps: number) => void }) {
  const { settings } = useSettings();
  const kph = settings.speedUnit === 'kph';
  const perUnit = kph ? 1 / 3.6 : 0.44704;
  const shown = Math.round(limit / perUnit);
  const set = (v: number) => {
    const clamped = Math.min(kph ? 150 : 90, Math.max(kph ? 10 : 5, v));
    onChange(clamped * perUnit);
    haptics.light();
  };
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-3 py-2">
      <span className="text-xs font-semibold flex-1">{tr("Pit lane limit")}</span>
      <Button variant="outline" size="sm" className="h-10 w-12" onClick={() => set(Math.round(shown / 5) * 5 - 5)} aria-label={tr("Lower the pit limit")}>
        −5
      </Button>
      <span className="font-mono font-bold tabular-nums w-20 text-center">
        {shown} {getSpeedLabel(settings.speedUnit)}
      </span>
      <Button variant="outline" size="sm" className="h-10 w-12" onClick={() => set(Math.round(shown / 5) * 5 + 5)} aria-label={tr("Raise the pit limit")}>
        +5
      </Button>
    </div>
  );
}

function IdlePanel({ snap, ended }: { snap: RacerSnapshot | null; ended: boolean }) {
  const phase = snap?.phase ?? 'idle';
  const walk = snap?.walk ?? null;
  const track = snap?.track ?? null;
  const Icon = phase === 'walking' ? Footprints : phase === 'armed' ? Flag : Hourglass;
  const title = !snap
    ? tr("Connecting to the racer…")
    : phase === 'walking'
      ? walk?.closed
        ? tr("Lap recorded. Racer is placing the timing lines")
        : tr("Recording a new track · {0} m", [Math.round(walk?.travelled ?? 0)])
      : phase === 'armed'
        ? snap.inPosition === false
          ? tr("Racer is heading to the grid")
          : tr("Racer is ready on the grid. Timing starts at launch")
        : ended
          ? tr("Session over. Waiting for the next run")
          : track
            ? tr("{0} selected. Waiting for the racer to ready up", [track.name])
            : tr("Waiting for the racer to pick a track");
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('rounded-2xl border px-3 py-2 flex items-center gap-2', phase === 'armed' && snap?.inPosition !== false ? 'border-accent bg-accent/10 animate-pulse' : 'border-border bg-card/50')}>
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
        pitLane={phase === 'walking' ? undefined : track?.pitLane}
        startFinishPits={phase === 'walking' ? undefined : track?.startFinishPits}
        dot={snap?.pos ?? null}
      />
    </div>
  );
}
