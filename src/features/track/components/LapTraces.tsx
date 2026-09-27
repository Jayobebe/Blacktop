import { useMemo, useState } from 'react';
import type { TelemetrySample } from '../types';

/** Validated for the dark surface (dataviz check: all six pass). */
export const LAP_A_COLOR = '#3987e5';
export const LAP_B_COLOR = '#d95926';

interface Series {
  label: string;
  samples: TelemetrySample[];
  startT: number;
}

interface Channel {
  key: string;
  title: string;
  unit: string;
  get: (s: TelemetrySample) => number | undefined;
  fmt: (v: number) => string;
  zero?: boolean;
}

const W = 320;
const H = 84;

/** Value at a distance by interpolating between the samples either side. */
function at<T extends { d: number }>(samples: T[], d: number, get: (s: T) => number | undefined): number | undefined {
  if (!samples.length || d < samples[0].d || d > samples[samples.length - 1].d) return undefined;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const va = get(a);
  const vb = get(b);
  if (va == null || vb == null) return va ?? vb;
  const f = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
  return va + f * (vb - va);
}

/**
 * Lap traces against distance round the lap: speed, lean and G for one or
 * two laps (A vs B), plus B's running time gap to A — where time was won or
 * lost. One shared crosshair reads every chart at the same point on track.
 */
export function LapTraces({ a, b, speedUnit }: { a: Series; b?: Series | null; speedUnit: 'mph' | 'kph' }) {
  const [hoverD, setHoverD] = useState<number | null>(null);
  const k = speedUnit === 'kph' ? 3.6 : 2.23694;
  const hasLean = a.samples.some((s) => s.lean != null && s.lean !== 0);
  const hasG = a.samples.some((s) => s.g != null && s.g !== 0);

  const channels: Channel[] = [
    { key: 'v', title: 'Speed', unit: speedUnit, get: (s) => s.v * k, fmt: (v) => v.toFixed(0), zero: true },
    ...(hasLean ? [{ key: 'lean', title: 'Lean', unit: '°', get: (s: TelemetrySample) => s.lean, fmt: (v: number) => v.toFixed(0) }] : []),
    ...(hasG ? [{ key: 'g', title: 'G', unit: 'g', get: (s: TelemetrySample) => s.g, fmt: (v: number) => v.toFixed(2), zero: true }] : []),
  ];

  const maxD = Math.max(a.samples[a.samples.length - 1]?.d ?? 0, b?.samples[b.samples.length - 1]?.d ?? 0, 1);

  // B's time gap to A at each point of the lap (+ = B behind).
  const gap = useMemo(() => {
    if (!b) return [];
    return b.samples
      .map((s) => {
        const ta = at(a.samples, s.d, (x) => x.t - a.startT);
        return ta == null ? null : { d: s.d, v: s.t - b.startT - ta };
      })
      .filter((x): x is { d: number; v: number } => x !== null);
  }, [a, b]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverD(Math.max(0, Math.min(maxD, ((e.clientX - r.left) / r.width) * maxD)));
  };

  const X = (d: number) => (d / maxD) * W;

  return (
    <div className="space-y-2" onPointerLeave={() => setHoverD(null)}>
      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded" style={{ background: LAP_A_COLOR }} />{a.label}</span>
        {b && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: LAP_B_COLOR }} />{b.label}</span>}
        {hoverD !== null && <span className="ml-auto font-mono text-muted-foreground">{Math.round(hoverD)} m</span>}
      </div>

      {channels.map((ch) => {
        const vals = [...a.samples, ...(b?.samples ?? [])].map(ch.get).filter((v): v is number => v != null && Number.isFinite(v));
        let lo = Math.min(...vals, ch.zero ? 0 : Infinity);
        let hi = Math.max(...vals);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-6) {
          lo = 0;
          hi = 1;
        }
        const Y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 16);
        const line = (samples: TelemetrySample[]) =>
          samples
            .map((s) => ({ d: s.d, v: ch.get(s) }))
            .filter((p) => p.v != null)
            .map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.v!).toFixed(1)}`)
            .join(' ');
        const va = hoverD !== null ? at(a.samples, hoverD, ch.get) : undefined;
        const vb = hoverD !== null && b ? at(b.samples, hoverD, ch.get) : undefined;
        return (
          <Chart key={ch.key} title={`${ch.title} (${ch.unit})`} hi={ch.fmt(hi)} lo={ch.fmt(lo)} readout={
            hoverD !== null ? (
              <>
                {va != null && <span style={{ color: LAP_A_COLOR }}>●</span>} <span className="text-foreground">{va != null ? ch.fmt(va) : '—'}</span>
                {b && <> · <span style={{ color: LAP_B_COLOR }}>●</span> <span className="text-foreground">{vb != null ? ch.fmt(vb) : '—'}</span></>}
              </>
            ) : null
          }>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[84px] touch-none" onPointerMove={onMove} onPointerDown={onMove}>
              {lo < 0 && hi > 0 && <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              <path d={line(a.samples)} fill="none" stroke={LAP_A_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {b && <path d={line(b.samples)} fill="none" stroke={LAP_B_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeDasharray="5 3" />}
              {hoverD !== null && <line x1={X(hoverD)} x2={X(hoverD)} y1={0} y2={H} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </svg>
          </Chart>
        );
      })}

      {b && gap.length > 1 && (() => {
        const vals = gap.map((g) => g.v / 1000);
        const m = Math.max(0.05, ...vals.map(Math.abs));
        const Y = (v: number) => H / 2 - (v / m) * (H / 2 - 6);
        const g = hoverD !== null ? at(gap, hoverD, (p) => p.v) : undefined;
        return (
          <>
          <Chart
            title={`Time gap: ${b.label} vs ${a.label} (s)`}
            hi={`+${m.toFixed(2)}`}
            lo={`−${m.toFixed(2)}`}
            readout={g != null ? <span className="text-foreground">{g > 0 ? '+' : '−'}{Math.abs(g / 1000).toFixed(3)} s</span> : null}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[84px] touch-none" onPointerMove={onMove} onPointerDown={onMove}>
              <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={gap.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.v / 1000).toFixed(1)}`).join(' ')} fill="none" stroke={LAP_B_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {hoverD !== null && <line x1={X(hoverD)} x2={X(hoverD)} y1={0} y2={H} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </svg>
          </Chart>
          <p className="text-[9px] text-muted-foreground -mt-1 px-1">Above the line: {b.label} is behind. Rising: losing time there.</p>
          </>
        );
      })()}
    </div>
  );
}

function Chart({ title, hi, lo, readout, children }: { title: string; hi: string; lo: string; readout: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 pt-1.5 pb-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wider">{title}</span>
        <span className="font-mono">{readout}</span>
      </div>
      <div className="relative">
        <span className="absolute left-0 top-0 text-[8px] font-mono text-muted-foreground/70">{hi}</span>
        <span className="absolute left-0 bottom-0 text-[8px] font-mono text-muted-foreground/70">{lo}</span>
        {children}
      </div>
    </div>
  );
}
