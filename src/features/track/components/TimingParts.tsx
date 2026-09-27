import { cn } from '@/lib/utils';
import type { Lap } from '../types';
import { formatDelta, formatLap } from '../lib/timing';
import { sectorTone, type SectorTone } from '../lib/laps';

const TONE: Record<SectorTone, string> = {
  best: 'bg-[#7c3aed] text-white border-[#a78bfa]',
  better: 'bg-[#16a34a] text-white border-[#4ade80]',
  slower: 'bg-[#ca8a04] text-black border-[#facc15]',
  none: 'bg-card text-muted-foreground border-border',
};

export function SectorBoxes({
  count,
  splits,
  bestBefore,
  lastLap,
  big,
}: {
  count: number;
  splits: (number | undefined)[];
  bestBefore: number[];
  lastLap: Lap | null;
  big?: boolean;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${count <= 5 ? count : Math.ceil(count / Math.ceil(count / 5))}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => {
        const ms = splits[i];
        return (
          <div key={i} className={cn('rounded-lg border text-center py-1.5', TONE[sectorTone(ms, i, bestBefore, lastLap)])}>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">S{i + 1}</p>
            <p className={cn('font-mono font-bold tabular-nums', big ? 'text-lg' : 'text-sm')}>{ms != null ? (ms / 1000).toFixed(3) : '—'}</p>
          </div>
        );
      })}
    </div>
  );
}

export function DeltaReadout({ delta, className }: { delta: number | null; className?: string }) {
  const tone = delta == null ? 'text-muted-foreground' : delta <= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]';
  return <span className={cn('font-mono font-black tabular-nums', tone, className)}>{delta == null ? '±0.000' : formatDelta(delta)}</span>;
}

/** Lap list: best lap starred, invalid / low-confidence laps flagged, sectors coloured. */
export function LapTable({ laps, sectors }: { laps: Lap[]; sectors: number }) {
  const valid = laps.filter((l) => l.valid);
  const best = valid.reduce<Lap | null>((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const bestSec = Array.from({ length: sectors }, (_, i) => Math.min(...valid.map((l) => l.sectors[i] ?? Infinity)));
  if (laps.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">No laps yet. Cross the start / finish line to start timing.</p>;
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <div style={{ minWidth: sectors > 4 ? `${6 + sectors * 3.4 + 5}rem` : undefined }}>
      <div className="grid text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-2 py-1.5" style={{ gridTemplateColumns: `2rem 1fr repeat(${sectors}, 3.4rem)` }}>
        <span>Lap</span>
        <span>Time</span>
        {Array.from({ length: sectors }, (_, i) => (
          <span key={i} className="text-right">S{i + 1}</span>
        ))}
      </div>
      {[...laps].reverse().map((l) => (
        <div
          key={l.n}
          className={cn('grid items-center px-2 py-1.5 border-t border-border/60 text-xs', !l.valid && 'opacity-45', best?.n === l.n && 'bg-[#7c3aed]/15')}
          style={{ gridTemplateColumns: `2rem 1fr repeat(${sectors}, 3.4rem)` }}
        >
          <span className="font-mono text-muted-foreground">{l.n}</span>
          <span className="font-mono font-bold tabular-nums">
            {formatLap(l.ms)}
            {best?.n === l.n && <span className="ml-1 text-[#a78bfa]">★</span>}
            {!l.valid && <span className="ml-1 text-[9px] font-sans text-muted-foreground">cut</span>}
            {l.valid && l.lowConfidence && <span className="ml-1 text-[9px] font-sans text-warning" title="GPS gap near a line">~</span>}
          </span>
          {Array.from({ length: sectors }, (_, i) => {
            const ms = l.sectors[i];
            return (
              <span key={i} className={cn('text-right font-mono tabular-nums', ms != null && ms === bestSec[i] && 'text-[#a78bfa] font-bold')}>
                {ms != null ? (ms / 1000).toFixed(2) : '—'}
              </span>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}

