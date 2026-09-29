import { useEffect, useRef, useState } from 'react';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

type Pt = { x: number; y: number };

/** Dot i (0–8) on the 300×300 grid. */
const dotAt = (i: number): Pt => ({ x: 50 + (i % 3) * 100, y: 50 + Math.floor(i / 3) * 100 });
const HIT_R = 36;

/**
 * A 3×3 pattern lock like Android's: press on a dot and drag through others.
 * Crossing straight over a dot that isn't joined yet joins it too. Releasing
 * hands the pattern (dot numbers in order) to `onDone`; the parent answers
 * with `tone` (red for wrong, green for right) and bumps `clearKey` to reset.
 */
export function PatternLock({
  onDone,
  tone = 'idle',
  clearKey = 0,
  disabled = false,
  className,
}: {
  onDone: (pattern: number[]) => void;
  tone?: 'idle' | 'error' | 'success';
  clearKey?: number;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<number[]>([]);
  const pathRef = useRef<number[]>([]);
  const [pointer, setPointer] = useState<Pt | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    pathRef.current = [];
    setPath([]);
    setPointer(null);
  }, [clearKey]);

  const local = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 };
  };
  const hit = (p: Pt) => {
    for (let i = 0; i < 9; i++) {
      const d = dotAt(i);
      if (Math.hypot(d.x - p.x, d.y - p.y) < HIT_R) return i;
    }
    return -1;
  };
  const join = (i: number) => {
    const cur = pathRef.current;
    if (cur.includes(i)) return;
    const next = [...cur];
    const last = cur[cur.length - 1];
    if (last !== undefined) {
      const [lx, ly, ix, iy] = [last % 3, Math.floor(last / 3), i % 3, Math.floor(i / 3)];
      if ((lx + ix) % 2 === 0 && (ly + iy) % 2 === 0) {
        const mid = ((ly + iy) / 2) * 3 + (lx + ix) / 2;
        if (!next.includes(mid)) next.push(mid);
      }
    }
    next.push(i);
    pathRef.current = next;
    setPath(next);
    haptics.tick();
  };

  const color = tone === 'error' ? 'hsl(var(--destructive))' : tone === 'success' ? '#22c55e' : 'white';
  const pts = path.map(dotAt);
  const trail = [...pts, ...(pointer && drawing.current && pts.length ? [pointer] : [])];

  return (
    <div
      ref={ref}
      role="application"
      aria-label={tr("Unlock pattern: join the dots")}
      className={cn('relative aspect-square select-none', disabled && 'opacity-40', className)}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (disabled) return;
        drawing.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* keep drawing without capture */
        }
        pathRef.current = [];
        setPath([]);
        const p = local(e);
        setPointer(p);
        const i = hit(p);
        if (i >= 0) join(i);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = local(e);
        setPointer(p);
        const i = hit(p);
        if (i >= 0) join(i);
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        setPointer(null);
        if (pathRef.current.length) onDone(pathRef.current);
      }}
      onPointerCancel={() => {
        drawing.current = false;
        setPointer(null);
      }}
    >
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
        {trail.length > 1 && (
          <polyline
            points={trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            style={{ stroke: color }}
            strokeOpacity={0.75}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {Array.from({ length: 9 }, (_, i) => {
          const d = dotAt(i);
          const on = path.includes(i);
          return (
            <g key={i}>
              <circle cx={d.x} cy={d.y} r={on ? 24 : 0} style={{ fill: color }} fillOpacity={0.14} className="transition-all duration-150" />
              <circle cx={d.x} cy={d.y} r={on ? 10 : 7} style={{ fill: on ? color : 'rgba(255,255,255,0.55)' }} className="transition-all duration-150" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
