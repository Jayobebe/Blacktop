import { cn } from '@/lib/utils';
import type { Gate, LatLng } from '../types';
import { toLocal } from '../lib/geometry';
import { tr } from '@/lib/i18n';

export interface MinimapLine {
  points: LatLng[];
  color: string;
  width?: number;
  dashed?: boolean;
  label?: string;
}

/**
 * Plain-SVG track minimap (no tiles, works offline): the walked outline, any
 * number of coloured lines (a live trail, two laps' racing lines), the timing
 * lines and a live dot.
 */
export function TrackMinimap({
  outline,
  lines = [],
  startFinish,
  splits = [],
  dot,
  className,
  pitLane,
  startFinishPits,
}: {
  /** The pit lane (dashed) and the start/finish carried across it (thin). */
  pitLane?: LatLng[][];
  startFinishPits?: Gate | null;
  outline?: LatLng[];
  lines?: MinimapLine[];
  startFinish?: Gate | null;
  splits?: Gate[];
  dot?: LatLng | null;
  className?: string;
}) {
  const gates = [...(startFinish ? [{ g: startFinish, sf: true }] : []), ...splits.map((g) => ({ g, sf: false }))];
  const ref = startFinish?.a ?? outline?.[0] ?? lines.find((l) => l.points.length)?.points[0] ?? dot ?? null;
  if (!ref) {
    return <div className={cn('rounded-2xl border border-border bg-card/50 flex items-center justify-center text-xs text-muted-foreground', className)}>{tr("Waiting for GPS…")}</div>;
  }
  const P = (p: LatLng) => toLocal(p, ref);
  const all = [
    ...(outline ?? []).map(P),
    ...lines.flatMap((l) => l.points.map(P)),
    ...gates.flatMap(({ g }) => [P(g.a), P(g.b)]),
    ...(dot ? [P(dot)] : []),
  ];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 0), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
  const span = Math.max(maxX - minX, maxY - minY, 60);
  const pad = span * 0.08;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = span / 2 + pad;
  const vb = `${cx - half} ${-cy - half} ${half * 2} ${half * 2}`;
  const path = (pts: LatLng[]) => pts.map((p, i) => { const q = P(p); return `${i ? 'L' : 'M'}${q.x.toFixed(1)},${(-q.y).toFixed(1)}`; }).join(' ');
  const u = span / 100; // 1 % of the view, for stroke widths
  const dp = dot ? P(dot) : null;

  return (
    <div className={cn('rounded-2xl border border-border bg-card/50 p-2', className)}>
      <svg viewBox={vb} className="w-full h-full" role="img" aria-label={tr("Track map")}>
        {outline && outline.length > 1 && (
          <path d={path(outline)} fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.35} strokeWidth={u * 2.2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {pitLane?.map((l, i) =>
          l.length > 1 ? (
            <path key={`pit${i}`} d={path(l)} fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={u * 0.9} strokeDasharray={`${u * 1.6} ${u * 1.2}`} strokeLinecap="round" />
          ) : null,
        )}
        {startFinishPits && (() => {
          const a = P(startFinishPits.a);
          const b = P(startFinishPits.b);
          return <line x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={u * 0.6} strokeLinecap="round" />;
        })()}
        {lines.map((l, i) =>
          l.points.length > 1 ? (
            <path
              key={i}
              d={path(l.points)}
              fill="none"
              stroke={l.color}
              strokeWidth={u * (l.width ?? 0.9)}
              strokeDasharray={l.dashed ? `${u * 2} ${u * 1.4}` : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {gates.map(({ g, sf }, i) => {
          const a = P(g.a);
          const b = P(g.b);
          return <line key={i} x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke={sf ? '#ffffff' : '#a855f7'} strokeWidth={u * 1.3} strokeLinecap="round" />;
        })}
        {dp && <circle cx={dp.x} cy={-dp.y} r={u * 2.6} fill="hsl(var(--accent))" stroke="#000" strokeWidth={u * 0.5} />}
      </svg>
    </div>
  );
}
