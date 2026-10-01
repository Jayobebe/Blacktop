import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { PitStop } from '../types';
import { tr } from '@/lib/i18n';

const MPS_TO_MPH = 2.23694;

/** Seconds as "12.3 s", or "1:05.2" past a minute. */
function pitSeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return tr("{0} s", [s.toFixed(1)]);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Speed against the pit limit: green under, amber within 10 %, red over. */
function limitTone(v: number, limit: number): 'ok' | 'near' | 'over' {
  if (v > limit + 0.5) return 'over';
  if (v > limit * 0.9) return 'near';
  return 'ok';
}

const TONE = {
  ok: 'text-[#22c55e] border-[#22c55e]/60 bg-[#22c55e]/10',
  near: 'text-warning border-warning/60 bg-warning/10',
  over: 'text-destructive border-destructive bg-destructive/15 animate-pulse',
} as const;

/**
 * In the pit lane, on the racer's screen and live on the pit crew's: the pit
 * lane time, the time stood in the box, and speed coloured against the limit.
 */
export function PitLaneCard({
  live,
  speed,
  limit,
  now,
  big,
}: {
  live: { inT: number; stoppedSince: number | null; stationaryMs: number; stops: number; overLimitMs: number };
  /** m/s */
  speed: number;
  /** m/s */
  limit: number;
  /** Clock to time against (the racer's own, or the crew's corrected for the racer's). */
  now: number;
  big?: boolean;
}) {
  const { settings } = useSettings();
  const unit = getSpeedLabel(settings.speedUnit);
  const tone = limitTone(speed, limit);
  const stopped = live.stoppedSince !== null;
  const boxMs = live.stationaryMs + (stopped ? now - live.stoppedSince! : 0);
  return (
    <div className={cn('rounded-2xl border-2 px-3 py-2', TONE[stopped ? 'ok' : tone])}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.3em]">{tr("Pit lane")}</span>
        <span className="text-[11px] font-mono">{tr("Limit {0} {1}", [formatSpeed(limit * MPS_TO_MPH, settings.speedUnit), unit])}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mt-1">
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-80">{tr("Speed")}</p>
          <p className={cn('font-mono font-black tabular-nums', big ? 'text-4xl' : 'text-2xl')}>{formatSpeed(speed * MPS_TO_MPH, settings.speedUnit)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-80">{tr("In pits")}</p>
          <p className={cn('font-mono font-bold tabular-nums text-foreground', big ? 'text-2xl' : 'text-lg')}>{pitSeconds(now - live.inT)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest opacity-80">{stopped ? tr("In the box") : tr("Stopped")}</p>
          <p className={cn('font-mono font-bold tabular-nums text-foreground', big ? 'text-2xl' : 'text-lg')}>{pitSeconds(boxMs)}</p>
        </div>
      </div>
      {live.overLimitMs > 0 && <p className="mt-1 text-[11px] text-destructive font-semibold text-center">{tr("Over the limit for {0}", [pitSeconds(live.overLimitMs)])}</p>}
    </div>
  );
}

/** A finished pit stop as one line: lane time, time in the box, over-limit time. */
export function PitStopLine({ stop }: { stop: PitStop }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card/50 px-3 py-2 text-xs">
      <span className="font-semibold">{stop.fromStart ? tr("Pit exit") : tr("Stop {0}", [stop.n])}</span>
      <span className="font-mono tabular-nums">{tr("Lane {0}", [pitSeconds(stop.laneMs)])}</span>
      <span className="font-mono tabular-nums">{tr("Box {0}", [pitSeconds(stop.stationaryMs)])}</span>
      {stop.overLimitMs > 0 ? (
        <span className="font-mono tabular-nums text-destructive">{tr("+{0} over", [pitSeconds(stop.overLimitMs)])}</span>
      ) : (
        <span className="text-[#22c55e]">{tr("Under limit")}</span>
      )}
    </div>
  );
}
