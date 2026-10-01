import { lazy, Suspense, useMemo, useState } from 'react';
import { Download, FileText, Trash2, Video } from 'lucide-react';
import type { RideSession } from '@/types/blacktop';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { analyseCorners } from '@/features/ride';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { TrackSession } from '../types';
import { formatLap } from '../lib/timing';
import { theoreticalBest } from '../lib/laps';
import { deleteSession, useTrackStore } from '../lib/trackStore';
import { fileStem, lapsCsv, sessionCsv, sessionGpx, shareFile } from '../lib/export';
import { LapTable } from './TimingParts';
import { PitStopLine } from './PitLaneCard';
import { TrackMinimap } from './TrackMinimap';
import { LAP_A_COLOR, LAP_B_COLOR, LapTraces } from './LapTraces';
import { tr } from '@/lib/i18n';

// The 3D flyover is the ride one (MapLibre): loaded only when it's opened.
const RideFlyover = lazy(() => import('@/features/ride/components/RideFlyover').then((m) => ({ default: m.RideFlyover })));

/** A Track Day session as the ride flyover reads a ride (positions, speed in mph, lean and G). */
function asRide(session: TrackSession): RideSession {
  const samples = session.samples;
  return {
    id: session.id,
    name: session.trackName,
    startedAt: new Date(session.startedAt).toISOString(),
    duration: Math.max(1, Math.round((session.endedAt - session.startedAt) / 1000)),
    gpsPoints: samples.map((s) => ({ lat: s.lat, lng: s.lng, speed: s.v * 2.23694, timestamp: s.t, leanAngle: s.lean })),
    leanSamples: samples.filter((s) => s.lean != null).map((s) => ({ angle: s.lean!, timestamp: s.t })),
    gForceSamples: samples.filter((s) => s.g != null).map((s) => ({ g: s.g!, timestamp: s.t })),
  } as unknown as RideSession;
}

/**
 * After a session: lap list, two laps compared (traces, racing lines, corner
 * scores) and exports.
 */
export function SessionDetail({ session, onBack, autoFlyover = false }: { session: TrackSession; onBack: () => void; /** The pit crew asked for the flyover: it plays on opening. */ autoFlyover?: boolean }) {
  const { settings } = useSettings();
  const { tracks } = useTrackStore();
  const track = tracks.find((t) => t.id === session.trackId);
  const sectors = session.splitsCount + 1;
  const valid = session.laps.filter((l) => l.valid);
  const best = valid.reduce<(typeof valid)[number] | null>((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const last = session.laps[session.laps.length - 1] ?? null;
  const [aN, setAN] = useState<number | null>(best?.n ?? last?.n ?? null);
  const [flyover, setFlyover] = useState(autoFlyover && session.samples.length > 10);
  const [bN, setBN] = useState<number | null>(last && best && last.n !== best.n ? last.n : null);

  const lapSamples = (n: number | null) => {
    const lap = session.laps.find((l) => l.n === n);
    return lap ? { lap, samples: session.samples.filter((s) => s.lap === n && s.t <= lap.endT) } : null;
  };
  const A = lapSamples(aN);
  const B = lapSamples(bN);

  const corners = useMemo(() => {
    const report = (x: ReturnType<typeof lapSamples>) =>
      x && x.samples.length > 6
        ? analyseCorners({
            gpsPoints: x.samples.map((s) => ({ lat: s.lat, lng: s.lng, speed: s.v * 2.23694, timestamp: s.t, leanAngle: s.lean })),
            distance: x.lap.distance / 1609.344,
            startedAt: new Date(x.lap.startT).toISOString(),
          })
        : null;
    return { a: report(A), b: report(B) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aN, bN, session.id]);

  const topSpeed = Math.max(0, ...session.laps.map((l) => l.maxSpeed));
  const spd = (ms: number) => `${formatSpeed(ms * 2.23694, settings.speedUnit)} ${getSpeedLabel(settings.speedUnit)}`;
  const lapLabel = (n: number | null) => (n == null ? '' : `Lap ${n}${best?.n === n ? ' ★' : ''}`);

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader title={session.trackName} subtitle={new Date(session.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} onBack={onBack} />

      <div className="grid grid-cols-4 gap-2 text-center">
        <Box label={tr("Best")} value={formatLap(best?.ms)} accent />
        <Box label={tr("Theoretical")} value={formatLap(theoreticalBest(session.laps, sectors))} />
        <Box label={tr("Laps")} value={String(session.laps.length)} />
        <Box label={tr("Top")} value={spd(topSpeed)} />
      </div>

      {session.samples.length > 10 && (
        <Button variant="outline" className="h-12 gap-2" onClick={() => setFlyover(true)}>
          <Video className="w-4 h-4" />{" "}{tr("3D flyover")}
        </Button>
      )}
      {flyover && (
        <Suspense fallback={null}>
          <RideFlyover ride={asRide(session)} onClose={() => setFlyover(false)} />
        </Suspense>
      )}

      {session.laps.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <LapSelect label={tr("Lap A")} color={LAP_A_COLOR} value={aN} onChange={setAN} laps={session.laps} />
            <LapSelect label={tr("Lap B (compare)")} color={LAP_B_COLOR} value={bN} onChange={setBN} laps={session.laps} allowNone />
          </div>

          {A && A.samples.length > 1 ? (
            <LapTraces
              a={{ label: lapLabel(aN), samples: A.samples, startT: A.lap.startT }}
              b={B && B.samples.length > 1 ? { label: lapLabel(bN), samples: B.samples, startT: B.lap.startT } : null}
              speedUnit={settings.speedUnit}
            />
          ) : (
            <p className="text-xs text-muted-foreground text-center">{tr("No trace saved for this lap.")}</p>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{tr("Racing line")}</p>
            <TrackMinimap
              className="aspect-square"
              outline={track?.outline ?? session.samples.filter((s) => s.lap > 0).map((s) => ({ lat: s.lat, lng: s.lng }))}
              startFinish={track?.startFinish}
              splits={track?.splits}
              lines={[
                ...(A ? [{ points: A.samples, color: LAP_A_COLOR, width: 1 }] : []),
                ...(B ? [{ points: B.samples, color: LAP_B_COLOR, width: 1, dashed: true }] : []),
              ]}
            />
          </div>

          {corners.a && corners.a.corners.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                {tr("Corners ·")}{" "}{lapLabel(aN)}{" "}{tr("grade")}{" "}{corners.a.grade}
                {corners.b ? tr(" · {0} grade {1}", [lapLabel(bN), corners.b.grade]) : ''}
              </p>
              <div className="rounded-xl border border-border overflow-hidden text-xs">
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr] px-2 py-1 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>#</span>
                  <span>{tr("Turn")}</span>
                  <span className="text-right" style={{ color: LAP_A_COLOR }}>{tr("A")}</span>
                  <span className="text-right" style={{ color: LAP_B_COLOR }}>{tr("B")}</span>
                </div>
                {corners.a.corners.map((c, i) => {
                  const cb = corners.b?.corners[i];
                  return (
                    <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr] px-2 py-1 border-t border-border/60 font-mono">
                      <span className="text-muted-foreground">{i + 1}</span>
                      <span className="font-sans">{c.direction === 'left' ? tr("Left") : tr("Right")} {Math.round(c.arc)}°</span>
                      <span className="text-right">{c.score} · {Math.round(c.apexSpeed)}</span>
                      <span className="text-right">{cb ? `${cb.score} · ${Math.round(cb.apexSpeed)}` : '—'}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">{tr("Score 0–100 · apex speed mph")}</p>
            </div>
          )}
        </>
      )}

      <LapTable laps={session.laps} sectors={sectors} />
      {!!session.pitStops?.length && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tr("Pit stops")}</p>
          {session.pitStops.map((st) => (
            <PitStopLine key={st.n} stop={st} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(session)}-laps.csv`, lapsCsv(session), 'text/csv')}>
          <FileText className="w-4 h-4" />{" "}{tr("Laps CSV")}
        </Button>
        <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(session)}.csv`, sessionCsv(session), 'text/csv')}>
          <Download className="w-4 h-4" />{" "}{tr("Data CSV")}
        </Button>
        <Button variant="secondary" className="gap-1 text-xs" onClick={() => shareFile(`${fileStem(session)}.gpx`, sessionGpx(session), 'application/gpx+xml')}>
          <Download className="w-4 h-4" />{" "}{tr("GPX")}
        </Button>
      </div>
      <Button
        variant="ghost"
        className="text-destructive gap-1 text-xs"
        onClick={() => {
          deleteSession(session.id);
          toast(tr("Session deleted"));
          onBack();
        }}
      >
        <Trash2 className="w-4 h-4" />{" "}{tr("Delete session")}
      </Button>
    </div>
  );
}

function Box({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border px-1 py-1.5', accent ? 'border-[#a78bfa]/60 bg-[#7c3aed]/10' : 'border-border bg-card/50')}>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold tabular-nums text-xs">{value}</p>
    </div>
  );
}

function LapSelect({
  label,
  color,
  value,
  onChange,
  laps,
  allowNone,
}: {
  label: string;
  color: string;
  value: number | null;
  onChange: (n: number | null) => void;
  laps: TrackSession['laps'];
  allowNone?: boolean;
}) {
  return (
    <label className="rounded-xl border border-border bg-card/50 px-2 py-1.5 text-xs flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="w-3 h-[2px]" style={{ background: color }} />
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="bg-transparent font-mono font-bold outline-none"
      >
        {allowNone && <option value="">{tr("None")}</option>}
        {laps.map((l) => (
          <option key={l.n} value={l.n} className="bg-background">
            {tr("Lap")}{" "}{l.n} · {formatLap(l.ms)}{l.pit ? ` · ${l.pit === 'in' ? tr("IN") : l.pit === 'out' ? tr("OUT") : tr("PIT")}` : l.valid ? '' : tr(" (cut)")}
          </option>
        ))}
      </select>
    </label>
  );
}
