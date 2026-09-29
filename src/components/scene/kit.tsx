/* eslint-disable react-refresh/only-export-components -- a kit of scene helpers, not a page */
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The scene kit behind Blacktop's animated showcases (the Enterprise package
 * scenes and the demo slides): one SVG per scene on a fixed 320×200 canvas,
 * the app's own palette (near-black, white / grey, the accent; red / amber /
 * green / sky only where they mean something), smooth Catmull-Rom routes with
 * arc-length lookup, eased time windows and one HUD chip style. Scenes run at
 * ~30 fps and hold a still frame under reduced motion.
 */

export type Pt = [number, number];
export type Icon = LucideIcon;

export const VW = 320;
export const VH = 200;
export const A = 'hsl(var(--accent))';
export const aa = (o: number) => `hsl(var(--accent) / ${o})`;
export const BG = '#0b0b0e';
export const INK = '#EDEAE3';
export const MUTED = '#8E8980';
export const PANEL = 'rgba(15,15,19,0.94)';
export const LINE = 'rgba(255,255,255,0.09)';
export const ROAD = '#1d1d23';
export const ROAD_EDGE = '#29292f';
export const RED = '#ef4444';
export const AMBER = '#f59e0b';
export const GREEN = '#22c55e';
export const SKY = '#38bdf8';

// ---- Time and easing ---------------------------------------------------------

/** Seconds since mount (starting at `from`), ~30 fps; frozen under reduced motion. */
export function useSceneTime(from = 0): number {
  const [t, setT] = useState(from);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    const start = performance.now() - from * 1000;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      // A frame's timestamp can be a touch earlier than when this effect
      // started the clock: never let time run backwards past the start.
      setT(Math.max(from, (now - start) / 1000));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [from]);
  return t;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const frac = (x: number) => x - Math.floor(x);
export const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** 0 → 1 → 0: rises over `fade` from `a`, falls over `fade` to `b`. */
export const win = (t: number, a: number, b: number, fade = 0.35) => easeOut((t - a) / fade) * (1 - easeOut((t - (b - fade)) / fade));
export const rnd = (n: number) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- Smooth routes -----------------------------------------------------------

export function catmull(ctrl: Pt[], closed: boolean, per: number): Pt[] {
  const n = ctrl.length;
  const get = (i: number) => (closed ? ctrl[(i + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(closed ? out[0] : ctrl[n - 1]);
  return out;
}

/** A smoothed route with arc-length lookup: `at(f)` for f in 0..1 (wraps if closed). */
export class Route {
  pts: Pt[];
  cum: number[];
  total: number;
  closed: boolean;
  d: string;
  constructor(ctrl: Pt[], closed: boolean, per = 14) {
    this.closed = closed;
    this.pts = catmull(ctrl, closed, per);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    }
    this.total = this.cum[this.cum.length - 1];
    this.d = `M${this.pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}${closed ? ' Z' : ''}`;
  }
  at(f: number): { p: Pt; a: number } {
    const g = this.closed ? frac(f) : clamp01(f);
    const d = g * this.total;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const r = (d - this.cum[lo]) / seg;
    const [a, b] = [this.pts[lo], this.pts[hi]];
    return { p: [lerp(a[0], b[0], r), lerp(a[1], b[1], r)], a: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
  }
  /** Path along the route from f0 to f1 (f1 may exceed f0 + wrap on closed routes). */
  slice(f0: number, f1: number, n = 28): string {
    const pts = Array.from({ length: n + 1 }, (_, i) => this.at(lerp(f0, f1, i / n)).p);
    return `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
  }
}

export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ---- Drawing kit ---------------------------------------------------------------

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full aspect-[16/10] rounded-2xl border border-border/30 bg-[#0b0b0e] overflow-hidden animate-scale-in no-frost">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 w-full h-full" style={{ fontFamily: 'inherit' }} aria-hidden>
        {children}
      </svg>
    </div>
  );
}

/** Ids for this scene instance's gradients and filters. */
export function useIds() {
  const base = useId().replace(/:/g, '');
  return (name: string) => `${base}-${name}`;
}

export function Defs({ id }: { id: (n: string) => string }) {
  return (
    <defs>
      <filter id={id('glow')} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={id('soft')} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <radialGradient id={id('vignette')} cx="50%" cy="50%" r="75%">
        <stop offset="60%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
      </radialGradient>
      <pattern id={id('grid')} width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M16 0H0V16" fill="none" stroke="white" strokeOpacity="0.035" strokeWidth="0.6" />
      </pattern>
    </defs>
  );
}

export function Base({ id }: { id: (n: string) => string }) {
  return (
    <>
      <rect width={VW} height={VH} fill={BG} />
      <rect width={VW} height={VH} fill={`url(#${id('grid')})`} />
    </>
  );
}

export function Vignette({ id }: { id: (n: string) => string }) {
  return <rect width={VW} height={VH} fill={`url(#${id('vignette')})`} pointerEvents="none" />;
}

export function Road({ d, w = 6 }: { d: string; w?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={ROAD_EDGE} strokeWidth={w + 1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={ROAD} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

export function T({
  x,
  y,
  children,
  size = 7.5,
  weight = 600,
  color = INK,
  anchor = 'start',
  mono = false,
  spacing,
  opacity,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  mono?: boolean;
  spacing?: number;
  opacity?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      opacity={opacity}
      letterSpacing={spacing}
      style={{ fill: color, fontVariantNumeric: mono ? 'tabular-nums' : undefined }}
    >
      {children}
    </text>
  );
}

export function Ico({ I, x, y, s = 9, color = A, sw = 2.2 }: { I: Icon; x: number; y: number; s?: number; color?: string; sw?: number }) {
  return <I x={x} y={y} width={s} height={s} strokeWidth={sw} style={{ color }} />;
}

/** Rough text width for sizing HUD chips around translated labels. */
export const textW = (s: string, size = 7.5) => s.length * size * 0.56;

/** A HUD chip: icon + label, sized to its text. `right` anchors it by its right edge. */
export function Chip({
  x,
  y,
  label,
  I,
  color = A,
  tone,
  right = false,
  extra = 0,
  children,
  opacity = 1,
  dy = 0,
}: {
  x: number;
  y: number;
  label: string;
  I?: Icon;
  color?: string;
  tone?: string;
  right?: boolean;
  extra?: number;
  children?: ReactNode;
  opacity?: number;
  dy?: number;
}) {
  const w = (I ? 20 : 10) + textW(label) + extra;
  const x0 = right ? x - w : x;
  return (
    <g transform={`translate(${x0} ${y + dy})`} opacity={opacity}>
      <rect width={w} height={17} rx={5} fill={PANEL} stroke={tone ?? LINE} strokeWidth={0.8} />
      {I && <Ico I={I} x={6} y={4} s={9} color={color} />}
      <T x={I ? 19 : 6} y={11.4}>{label}</T>
      {children && <g transform={`translate(${w - extra - 4} 0)`}>{children}</g>}
    </g>
  );
}

export function Wave({ on, t, color = A, n = 5 }: { on: number; t: number; color?: string; n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const h = 1.6 + on * 6.5 * Math.abs(Math.sin(t * 9 + i * 1.7));
        return <rect key={i} x={i * 2.6} y={8.5 - h / 2} width={1.5} height={h} rx={0.75} style={{ fill: color }} opacity={0.35 + 0.65 * on} />;
      })}
    </g>
  );
}

export function Dot({ p, color, r = 4, halo = 0, haloColor }: { p: Pt; color: string; r?: number; halo?: number; haloColor?: string }) {
  return (
    <g transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
      {halo > 0 && <circle r={r + 4 + halo * 3} style={{ fill: haloColor ?? color }} opacity={0.22 * halo} />}
      <circle r={r + 1.5} fill={BG} opacity={0.9} />
      <circle r={r} style={{ fill: color }} />
      <circle r={r} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={1.1} />
    </g>
  );
}

/** A heading arrow for the vehicle the scene follows. */
export function Arrow({ p, a, color, glow, s = 1 }: { p: Pt; a: number; color: string; glow?: string; s?: number }) {
  return (
    <g transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${(a + 90).toFixed(1)}) scale(${s})`} filter={glow ? `url(#${glow})` : undefined}>
      <circle r={8.5} fill={BG} opacity={0.75} />
      <path d="M0 -6.8 L5 5.2 L0 2.6 L-5 5.2 Z" style={{ fill: color }} stroke="white" strokeWidth={1.1} strokeLinejoin="round" />
    </g>
  );
}

/** Expanding rings (0..1 phase) for pings and broadcasts. */
export function Rings({ p, phase, color, max = 26, count = 2 }: { p: Pt; phase: number; color: string; max?: number; count?: number }) {
  return (
    <g transform={`translate(${p[0]} ${p[1]})`}>
      {Array.from({ length: count }, (_, i) => {
        const k = frac(phase + i / count);
        return <circle key={i} r={6 + k * max} fill="none" stroke={color} strokeWidth={1.2} opacity={(1 - k) * 0.8} />;
      })}
    </g>
  );
}

/** t wrapped into [0, period), safe for negative t. */
export const loopT = (t: number, period: number) => ((t % period) + period) % period;
/** An index into a list of n that cycles every `step` seconds (safe for negative t). */
export const cycle = (t: number, step: number, n: number) => ((Math.floor(t / step) % n) + n) % n;

/** Ease out with a little overshoot, for things popping in. */
export const easeOutBack = (x: number) => {
  // Exact ends: the formula leaves ~1e-16 at 0, which reads as "started".
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const v = x;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};

/** The burn colour (fixed, never the accent). */
export const BURN = 'hsl(var(--burn))';

/** A HUD panel at (x, y): rounded, near-black, hairline edge. */
export function Panel({
  x,
  y,
  w,
  h,
  r = 8,
  fill = PANEL,
  stroke = LINE,
  sw = 0.8,
  opacity,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  opacity?: number;
  children?: ReactNode;
}) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} opacity={opacity}>
      <rect width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} />
      {children}
    </g>
  );
}

/** A thin progress bar, `f` filled (0..1). */
export function Bar({ x, y, w, h = 3, f, color = A, bg = 'rgba(255,255,255,0.08)' }: { x: number; y: number; w: number; h?: number; f: number; color?: string; bg?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={bg} />
      {f > 0.001 && <rect x={x} y={y} width={Math.max(h, w * clamp01(f))} height={h} rx={h / 2} style={{ fill: color }} />}
    </g>
  );
}

/** Scale-about-a-point transform for popping things in: `pop(p, k)`. */
export const popAt = (p: Pt, k: number) => `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${Math.max(0.001, k).toFixed(3)}) translate(${(-p[0]).toFixed(1)} ${(-p[1]).toFixed(1)})`;
