/* eslint-disable react-refresh/only-export-components -- a kit of scene helpers, not a page */
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import { DEMO_BIKE, GARAGE_SHOP, MECHA_NICK } from '@/lib/pictures';
import { tr } from '@/lib/i18n';
import { sceneCue, type SceneCueKind } from '@/lib/radioFx';
import { isThermal } from '@/lib/thermal';

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

/**
 * How a scene is being shown. The demo tour plays them like a film: `paused`
 * holds every scene clock where it is (the frame freezes, as a video does) and
 * `bare` draws the frame edge to edge without its own sound button (the tour
 * has one for everything).
 */
export const SceneStage = createContext<{ paused: boolean; bare: boolean; muted?: boolean; at?: number }>({ paused: false, bare: false });

/** Seconds since mount (starting at `from`), ~30 fps; frozen under reduced motion, and held while the stage is paused. */
export function useSceneTime(from = 0): number {
  const { paused, at } = useContext(SceneStage);
  const [t, setT] = useState(from);
  const tRef = useRef(from);
  useEffect(() => {
    if (paused || at !== undefined) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (isThermal()) return; // Thermal / High-Speed Mode: a still frame
    let raf = 0;
    let last = 0;
    // Carries on from where it was held.
    const begin = tRef.current;
    const start = performance.now() - begin * 1000;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      // A frame's timestamp can be a touch earlier than when this effect
      // started the clock: never let time run backwards past the start.
      const next = Math.max(begin, (now - start) / 1000);
      tRef.current = next;
      setT(next);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [from, paused, at]);
  // `at`: a still of the scene at that moment (contact sheets, posters).
  return at !== undefined ? from + at : t;
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
  /** Where along the route (0..1) it passes closest to `p`: for putting a manoeuvre on its junction. */
  near(p: Pt): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const d = Math.hypot(this.pts[i][0] - p[0], this.pts[i][1] - p[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return this.total ? this.cum[best] / this.total : 0;
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

// ---- Sound ---------------------------------------------------------------------

/** A sound on a scene's clock: [seconds into the loop, which sound]. */
export type SceneCue = [number, SceneCueKind];

/** When a rising f(t) first reaches `v` in [lo, hi] (for cueing on eased motion), or null. */
export function timeAt(f: (t: number) => number, v: number, lo: number, hi: number): number | null {
  if (f(lo) >= v) return lo;
  if (f(hi) < v) return null;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= v) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Cues from optional times (drops the ones that never happen). */
export const cues = (...list: [number | null, SceneCueKind][]): SceneCue[] => list.filter((c): c is SceneCue => c[0] != null);

const SOUND_KEY = 'blacktop_scene_sound';
let soundOn = (() => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
})();
const soundListeners = new Set<() => void>();

/** Whether scenes play their sounds (one switch for the demo tour and the Enterprise scenes). */
export function useSceneSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      soundListeners.add(l);
      return () => soundListeners.delete(l);
    },
    () => soundOn,
    () => soundOn,
  );
  return [
    on,
    (next) => {
      soundOn = next;
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        /* private mode: this visit only */
      }
      soundListeners.forEach((l) => l());
    },
  ];
}

/** A scene's sounds on one of its clocks (a looping time). */
export type SceneSound = { t: number; cues: SceneCue[] };

/**
 * Plays each track's cues as its clock passes them, only while the frame is
 * on screen and the page is visible. A jump (scrubbing, a hidden tab catching
 * up) plays nothing rather than a pile-up.
 */
function useCues(el: { current: HTMLDivElement | null }, sound?: SceneSound | SceneSound[]) {
  const [switchOn] = useSceneSound();
  const { muted } = useContext(SceneStage);
  const on = switchOn && !muted;
  const visible = useRef(false);
  const prev = useRef<(number | null)[]>([]);
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(node);
    return () => io.disconnect();
  }, [el]);
  const tracks = !sound ? [] : Array.isArray(sound) ? sound : [sound];
  const key = tracks.map((k) => k.t.toFixed(3)).join('|');
  useEffect(() => {
    const live = on && visible.current && document.visibilityState === 'visible';
    tracks.forEach(({ t, cues }, i) => {
      const last = prev.current[i] ?? null;
      prev.current[i] = t;
      if (last == null || !live) return;
      const wrapped = t < last;
      if (!wrapped && t - last > 1) return;
      for (const [at, kind] of cues) {
        if (wrapped ? at > last || at <= t : at > last && at <= t) sceneCue(kind);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);
}

export function Frame({ children, sound }: { children: ReactNode; sound?: SceneSound | SceneSound[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useSceneSound();
  const { bare } = useContext(SceneStage);
  useCues(ref, sound);
  return (
    <div
      ref={ref}
      className={bare ? 'relative w-full aspect-[16/10] bg-[#0b0b0e] overflow-hidden no-frost' : 'relative w-full aspect-[16/10] rounded-2xl border border-border/30 bg-[#0b0b0e] overflow-hidden animate-scale-in no-frost'}
    >
      <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 w-full h-full" style={{ fontFamily: 'inherit' }} aria-hidden>
        {children}
      </svg>
      {sound && !bare && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOn(!on);
          }}
          aria-label={on ? tr("Mute sound") : tr("Play sound")}
          aria-pressed={on}
          className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center bg-black/55 border border-white/10 text-white/70 hover:text-white transition-colors"
        >
          {on ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>
      )}
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
      {/* Mica: a soft dark backing that fades out at its edges, for a title over moving content. */}
      <radialGradient id={id('mica')} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0b0b0e" stopOpacity="0.82" />
        <stop offset="62%" stopColor="#0b0b0e" stopOpacity="0.62" />
        <stop offset="100%" stopColor="#0b0b0e" stopOpacity="0" />
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

/**
 * A faded backing behind a title drawn over a scene's animation, so it reads
 * cleanly: dark in the middle, gone at its edges, the animation still showing
 * round it. Only behind headings, never a whole scene.
 */
export function Mica({ id, x, y, w, h }: { id: (n: string) => string; x: number; y: number; w: number; h: number }) {
  return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={`url(#${id('mica')})`} pointerEvents="none" />;
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

/** CJK, kana and hangul glyphs: about a full em wide. */
const WIDE = /[ᄀ-ᇿ⺀-꓏가-힯豈-﫿＀-￯]/;

/** Rough text width for sizing HUD chips around translated labels (capitals, digits and CJK run wider). */
export const textW = (s: string, size = 7.5) => {
  let em = 0;
  for (const ch of s) em += WIDE.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? 0.66 : 0.56;
  return em * size;
};

/** Characters a line can break after anywhere (Chinese and Japanese have no spaces); hangul keeps its spaces. */
const BREAK_ANY = /[⺀-꓏豈-﫿＀-￯]/;
/** Closing punctuation that stays on the line before it. */
const NO_START = /^[、。，．！？：；」』）】〉》,.!?:;)]$/;

/** Splits a label into lines no wider than `maxW` at this size: at spaces, or between any two CJK characters. */
export function wrapText(s: string, maxW: number, size: number): string[] {
  const parts: { w: string; gap: boolean }[] = [];
  let gap = false;
  for (const m of s.trim().matchAll(/\s+|[⺀-꓏豈-﫿＀-￯]|[^\s⺀-꓏豈-﫿＀-￯]+/g)) {
    const w = m[0];
    if (/^\s+$/.test(w)) {
      gap = true;
      continue;
    }
    const last = parts[parts.length - 1];
    if (last && !gap && (NO_START.test(w) || (!BREAK_ANY.test(w) && !BREAK_ANY.test(last.w.slice(-1))))) last.w += w;
    else parts.push({ w, gap });
    gap = false;
  }
  const lines: string[] = [];
  let cur = '';
  for (const p of parts) {
    const next = cur ? cur + (p.gap ? ' ' : '') + p.w : p.w;
    if (cur && textW(next, size) > maxW) {
      lines.push(cur);
      cur = p.w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * The size and lines for a label in a box `maxW` wide: one line when it fits
 * at nearly full size, else up to `maxLines` lines, shrinking only if even
 * that won't do.
 */
export function fitLines(s: string, maxW: number, size: number, maxLines = 2): { lines: string[]; size: number } {
  const one = Math.min(size, maxW / Math.max(1, textW(s, 1)));
  if (one >= size * 0.9 || maxLines < 2) return { lines: [s], size: one };
  for (let z = size; z > 3; z -= 0.2) {
    const lines = wrapText(s, maxW, z);
    if (lines.length <= maxLines && lines.every((l) => textW(l, z) <= maxW)) return { lines, size: z };
  }
  return { lines: [s], size: one };
}

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
      <rect width={w} height={17} rx={5} style={{ fill: PANEL, stroke: tone ?? LINE }} strokeWidth={0.8} />
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
        return <circle key={i} r={6 + k * max} fill="none" style={{ stroke: color }} strokeWidth={1.2} opacity={(1 - k) * 0.8} />;
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
      <rect width={w} height={h} rx={r} style={{ fill, stroke }} strokeWidth={sw} />
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

// ---- The demo bike ---------------------------------------------------------------

// The demo bike image: 704×1094 with the bike between x 40–665 and y 270–840.
const IMG = { w: 704, h: 1094, top: 270, bottom: 840, left: 40, right: 665 };

export type BikePlacement = { cx: number; floor: number; height: number };

/** The demo bike scaled so the bike itself is `height` tall, its wheels resting at (cx, floor). */
export function BikePhoto({ cx, floor, height, filter, opacity }: BikePlacement & { filter?: string; opacity?: number }) {
  const s = height / (IMG.bottom - IMG.top);
  const w = IMG.w * s;
  const h = IMG.h * s;
  const x = cx - ((IMG.left + IMG.right) / 2) * s;
  const y = floor - IMG.bottom * s;
  return <image href={DEMO_BIKE} x={x} y={y} width={w} height={h} filter={filter} opacity={opacity} preserveAspectRatio="xMidYMid meet" />;
}

// ---- The workshop and Mecha-Nick ---------------------------------------------------

/** Mecha-Nick's picture is 96 × 172 pixels: his height in scene units makes his width. */
const NICK_ASPECT = 96 / 172;

/**
 * Mecha-Nick, cut straight from his own picture as a silhouette, feet at
 * (x, floor), `height` tall. Lit from behind: dark, with the accent catching
 * his left edge (`rim`). `shadow` draws him instead as a soft shadow thrown on
 * a screen. Animate him from outside: `lean` (degrees, about his feet),
 * `squash` (a breath or a crouch) and `dx` / `dy`.
 */
export function NickSilhouette({
  x,
  floor,
  height,
  lean = 0,
  squash = 1,
  rim = 1,
  shadow = false,
  opacity = 1,
}: {
  x: number;
  floor: number;
  height: number;
  lean?: number;
  squash?: number;
  rim?: number;
  shadow?: boolean;
  opacity?: number;
}) {
  const id = useIds();
  const w = height * NICK_ASPECT;
  const pic = { href: MECHA_NICK, width: w, height, style: { imageRendering: 'pixelated' as const } };
  return (
    <g opacity={opacity} transform={`translate(${x.toFixed(2)} ${floor.toFixed(2)}) rotate(${lean.toFixed(2)}) scale(1 ${squash.toFixed(4)})`}>
      <defs>
        <filter id={id('nick-dark')} x="-20%" y="-10%" width="140%" height="120%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={shadow ? '#020203' : '#07070a'} />
          <feComposite in2="SourceAlpha" operator="in" />
          {shadow && <feGaussianBlur stdDeviation={height / 90} />}
        </filter>
        <filter id={id('nick-rim')} x="-20%" y="-10%" width="140%" height="120%" colorInterpolationFilters="sRGB">
          <feFlood style={{ floodColor: A }} />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      {!shadow && rim > 0 && <image {...pic} x={-w / 2 - height / 110} y={-height - height / 200} filter={`url(#${id('nick-rim')})`} opacity={rim} />}
      <image {...pic} x={-w / 2} y={-height} filter={`url(#${id('nick-dark')})`} />
    </g>
  );
}

/**
 * The workshop the app's garage stands in (its own picture), filling a box:
 * dimmed for what's drawn over it, with the garage's vignette and a wash of the
 * accent along the floor.
 */
export function GarageBackdrop({ id, x = 0, y = 0, w = VW, h = VH, dim = 0.25 }: { id: (n: string) => string; x?: number; y?: number; w?: number; h?: number; dim?: number }) {
  return (
    <g>
      <defs>
        <radialGradient id={id('gb-vignette')} cx="50%" cy="60%" r="70%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
        </radialGradient>
        <linearGradient id={id('gb-floor')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: A }} stopOpacity="0.16" />
          <stop offset="1" style={{ stopColor: A }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <image href={GARAGE_SHOP} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" style={{ imageRendering: 'pixelated' }} />
      <rect x={x} y={y} width={w} height={h} fill="#000" opacity={dim} />
      <rect x={x} y={y} width={w} height={h} fill={`url(#${id('gb-vignette')})`} />
      <rect x={x} y={y + h * 0.66} width={w} height={h * 0.34} fill={`url(#${id('gb-floor')})`} />
    </g>
  );
}

/** Where a point of the bike photo (image pixels) lands in the scene, for a bike placed at `b`. */
export const bikeAt = (b: BikePlacement, ix: number, iy: number): Pt => {
  const s = b.height / (IMG.bottom - IMG.top);
  return [b.cx + (ix - (IMG.left + IMG.right) / 2) * s, b.floor - (IMG.bottom - iy) * s];
};
