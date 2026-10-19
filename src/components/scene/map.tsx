/* eslint-disable react-refresh/only-export-components -- a kit of scene helpers, not a page */
import { memo } from 'react';
import { A, BG, INK, MUTED, PANEL, LINE, T, Ico, catmull, clamp01, lerp, rnd, inside, textW, type Pt, type Icon } from './kit';

/*
 * The map half of the scene kit: scenes drawn as the Blacktop map itself.
 * Roads are smoothed curves through control points, and a road meets another
 * at a control point they share, so a route is built from the roads it takes
 * (`Path.along`) and its line lies on them exactly. A rider moves along a path
 * at a speed set by where they are on it (`Drive`: easing off for a hazard or
 * a camera, waiting at a stop), so what's on screen reads like a real ride.
 * Everything is a pure function of the scene clock, so stills and seeking
 * agree with playback.
 */

/** The Blacktop map's dark style as the app draws it (map/lib/basemapContrast.ts). */
export const MAP = {
  land: '#0e0f10',
  town: '#141415',
  park: '#18201a',
  wood: '#161d18',
  water: '#17202b',
  waterLine: '#1e2a38',
  building: '#222325',
  minor: '#454545',
  majorCase: '#7a7a7a',
  major: '#545454',
  motorwayCase: '#999999',
  motorway: '#575757',
  label: '#a8a8a8',
  waterLabel: '#7c9cc0',
  place: '#d1d1d1',
};

/** The rescue route's colour on the map (the burn colour, as BlacktopMap draws it). */
export const RESCUE = 'hsl(15 85% 52%)';

/** Convoy members' pin colours (lib/memberColors.ts). */
export const MEMBER = {
  emerald: '142 71% 45%',
  blue: '217 91% 60%',
  purple: '262 83% 58%',
  pink: '330 81% 60%',
  cyan: '186 94% 50%',
};

export type RoadClass = 'minor' | 'major' | 'motorway';
const ROAD_W: Record<RoadClass, number> = { minor: 3.2, major: 4.8, motorway: 6.2 };

const pathD = (pts: Pt[]) => (pts.length ? `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}` : '');

/**
 * A road through `ctrl`, smoothed and passing through every control point.
 * Control point i is sample i × per, so a junction (a point two roads share)
 * is exactly on both.
 */
export class Road {
  cls: RoadClass;
  ctrl: Pt[];
  pts: Pt[];
  per: number;
  d: string;
  name?: string;
  /** Where along the road its name sits (0..1), when it has one. */
  labelAt: number;
  constructor(cls: RoadClass, ctrl: Pt[], opts: { name?: string; labelAt?: number; per?: number } = {}) {
    this.cls = cls;
    this.ctrl = ctrl;
    this.per = opts.per ?? 10;
    this.pts = catmull(ctrl, false, this.per);
    this.d = pathD(this.pts);
    this.name = opts.name;
    this.labelAt = opts.labelAt ?? 0.5;
  }
  /** Index of a control point by position (the junction you mean). */
  idx(p: Pt): number {
    let best = 0;
    let bd = Infinity;
    this.ctrl.forEach((c, i) => {
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  /** The road between two of its control points, either way round. */
  between(from: Pt, to: Pt): Pt[] {
    const a = this.idx(from) * this.per;
    const b = this.idx(to) * this.per;
    return a <= b ? this.pts.slice(a, b + 1) : this.pts.slice(b, a + 1).reverse();
  }
}

/** A polyline with arc length: where something is along it, and slices of it. */
export class Path {
  pts: Pt[];
  cum: number[];
  len: number;
  constructor(pts: Pt[]) {
    this.pts = [];
    for (const p of pts) {
      const last = this.pts[this.pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) this.pts.push(p);
    }
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    }
    this.len = this.cum[this.cum.length - 1] ?? 0;
  }
  /** A route made of roads: each leg is a road from one of its junctions to another. */
  static along(legs: [Road, Pt, Pt][]): Path {
    const pts: Pt[] = [];
    for (const [road, from, to] of legs) pts.push(...road.between(from, to));
    return new Path(pts);
  }
  /** The same path, stopping `d` along (riders queueing behind one another). */
  until(d: number): Path {
    const out: Pt[] = [];
    for (let i = 0; i < this.pts.length && this.cum[i] < d; i++) out.push(this.pts[i]);
    out.push(this.point(d));
    return new Path(out);
  }
  /** The point `d` along. */
  point(d: number): Pt {
    const g = Math.max(0, Math.min(this.len, d));
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= g) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const r = (g - this.cum[lo]) / seg;
    const [a, b] = [this.pts[lo], this.pts[hi]];
    return [lerp(a[0], b[0], r), lerp(a[1], b[1], r)];
  }
  /** Where it is at `d`, and which way it's heading (degrees, as atan2), smoothed over a few units. */
  at(d: number): { p: Pt; a: number } {
    const p = this.point(d);
    const b = this.point(d - 2);
    const f = this.point(d + 2);
    return { p, a: (Math.atan2(f[1] - b[1], f[0] - b[0]) * 180) / Math.PI };
  }
  /** Path data from d0 to d1. */
  slice(d0: number, d1: number): string {
    const a = Math.max(0, Math.min(d0, d1));
    const b = Math.min(this.len, Math.max(d0, d1));
    if (b - a < 0.01) return '';
    const out: Pt[] = [this.point(a)];
    for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > a && this.cum[i] < b) out.push(this.pts[i]);
    out.push(this.point(b));
    return pathD(out);
  }
  /** How far along the point nearest `p` is (for putting a turn on its junction). */
  near(p: Pt): number {
    let best = 0;
    let bd = Infinity;
    this.pts.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return this.cum[best];
  }
}

/** A speed (scene units a second) from `d` along the path; `wait` stops there for that long first. */
export interface SpeedKey {
  d: number;
  v: number;
  wait?: number;
}

const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

/**
 * A vehicle on a path, its speed set by where it is (eased between the keys),
 * from `start` seconds on. Worked out once, then looked up by time.
 */
export class Drive {
  path: Path;
  start: number;
  private T: number[] = [];
  private D: number[] = [];
  private V: number[] = [];
  constructor(path: Path, keys: SpeedKey[], start = 0) {
    this.path = path;
    this.start = start;
    const ks = keys.map((k) => ({ ...k })).sort((x, y) => x.d - y.d);
    const vAt = (d: number) => {
      if (d <= ks[0].d) return ks[0].v;
      for (let k = 0; k < ks.length - 1; k++) {
        if (d < ks[k + 1].d) return lerp(ks[k].v, ks[k + 1].v, smooth((d - ks[k].d) / (ks[k + 1].d - ks[k].d)));
      }
      return ks[ks.length - 1].v;
    };
    const waits = ks.filter((k) => k.wait);
    let t = start;
    let d = Math.max(0, ks[0].d);
    const push = (v: number) => {
      this.T.push(t);
      this.D.push(d);
      this.V.push(v);
    };
    push(0);
    const ds = 0.4;
    while (d < path.len - 1e-6) {
      const stop = waits.find((k) => k.d > d - 1e-6 && k.d <= d + ds);
      if (stop?.wait) {
        const v = Math.max(0.5, vAt(stop.d));
        t += (stop.d - d) / v;
        d = stop.d;
        push(0);
        t += stop.wait;
        push(0);
        stop.wait = 0;
      }
      const step = Math.min(ds, path.len - d);
      const v = Math.max(0.5, vAt(d + step / 2));
      t += step / v;
      d += step;
      push(v);
    }
  }
  /** Where it is at time t: distance along, speed, point and heading. */
  at(t: number): { d: number; v: number; p: Pt; a: number } {
    const T = this.T;
    let d: number;
    let v: number;
    if (t <= T[0]) {
      d = this.D[0];
      v = 0;
    } else if (t >= T[T.length - 1]) {
      d = this.D[this.D.length - 1];
      v = 0;
    } else {
      let lo = 0;
      let hi = T.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (T[mid] <= t) lo = mid;
        else hi = mid;
      }
      const r = (t - T[lo]) / (T[hi] - T[lo] || 1);
      d = lerp(this.D[lo], this.D[hi], r);
      v = lerp(this.V[lo], this.V[hi], r);
    }
    return { d, v, ...this.path.at(d) };
  }
  /**
   * Speed by the clock instead of by place, for choreography (a group easing
   * off together when the leader calls a regroup): from each key's `t` the
   * speed eases to that key's `v` over `ease` seconds. It starts `d0` along.
   */
  static timed(path: Path, keys: { t: number; v: number }[], d0 = 0, ease = 0.8): Drive {
    const drive = Object.create(Drive.prototype) as Drive;
    const ks = [...keys].sort((x, y) => x.t - y.t);
    drive.path = path;
    drive.start = ks[0].t;
    drive.T = [];
    drive.D = [];
    drive.V = [];
    const vAt = (t: number) => {
      let k = 0;
      while (k + 1 < ks.length && ks[k + 1].t <= t) k++;
      const from = k > 0 ? ks[k - 1].v : ks[0].v;
      return lerp(from, ks[k].v, smooth((t - ks[k].t) / ease));
    };
    const dt = 1 / 120;
    let t = ks[0].t;
    let d = d0;
    const until = ks[ks.length - 1].t + 60;
    while (t <= until) {
      const v = vAt(t);
      drive.T.push(t);
      drive.D.push(d);
      drive.V.push(v);
      if (d >= path.len) break;
      d = Math.min(path.len, d + v * dt);
      t += dt;
    }
    return drive;
  }
  /** When it first reaches `d` along (for cueing sounds and calls). */
  when(d: number): number {
    const i = this.D.findIndex((x) => x >= d);
    return i < 0 ? this.T[this.T.length - 1] : this.T[i];
  }
  /** When it's done. */
  get end(): number {
    return this.T[this.T.length - 1];
  }
}

// ---- Camera --------------------------------------------------------------------

/** What the view is centred on, and how far in. */
export interface Cam {
  x: number;
  y: number;
  z: number;
}

/** The world → screen transform for a camera centred on `anchor`. */
export const camT = (c: Cam, anchor: Pt = [160, 100]) =>
  `translate(${anchor[0]} ${anchor[1]}) scale(${c.z.toFixed(4)}) translate(${(-c.x).toFixed(2)} ${(-c.y).toFixed(2)})`;

/** Where a world point lands on screen. */
export const toScreen = (c: Cam, p: Pt, anchor: Pt = [160, 100]): Pt => [anchor[0] + (p[0] - c.x) * c.z, anchor[1] + (p[1] - c.y) * c.z];

/**
 * A camera that follows a moving target smoothly: the average of where the
 * target was over the last `span` seconds. A pure function of the clock, so a
 * still of any moment matches playback.
 */
export function follow(target: (t: number) => Cam, t: number, span = 1.4, n = 14): Cam {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const c = target(t - (span * i) / (n - 1));
    x += c.x;
    y += c.y;
    z += c.z;
  }
  return { x: x / n, y: y / n, z: z / n };
}

// ---- The map itself --------------------------------------------------------------

export interface MapArea {
  kind: 'town' | 'park' | 'wood' | 'water';
  pts: Pt[];
}

/** A building: centre, size and turn (degrees). */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
}

export interface MapDef {
  areas: MapArea[];
  rivers?: { pts: Pt[]; w: number }[];
  roads: Road[];
  blocks?: Block[];
  /** Place names (towns, water) and points of interest, upright. */
  places?: { text: string; at: Pt; kind?: 'place' | 'water'; size?: number }[];
}

/** Buildings along a road: both sides, at `every` units, kept off every road in `avoid` and inside `within`. */
export function blocksAlong(
  road: Road,
  opts: { from?: number; to?: number; every?: number; seed?: number; within?: Pt[]; avoid?: Road[]; sides?: (1 | -1)[] } = {},
): Block[] {
  const path = new Path(road.pts);
  const every = opts.every ?? 9;
  const from = (opts.from ?? 0) * path.len;
  const to = (opts.to ?? 1) * path.len;
  const out: Block[] = [];
  const half = ROAD_W[road.cls] / 2;
  let i = 0;
  for (let d = from + every / 2; d < to; d += every, i++) {
    const { p, a } = path.at(d);
    const rad = (a * Math.PI) / 180;
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    for (const side of opts.sides ?? [1, -1]) {
      const r = rnd((opts.seed ?? 1) * 97 + i * 13 + (side > 0 ? 5 : 0));
      if (r < 0.18) continue;
      const depth = 4 + r * 4;
      const width = every * (0.55 + 0.3 * rnd(i * 7 + side));
      const off = half + 2.2 + depth / 2;
      const c: Pt = [p[0] + nx * off * side, p[1] + ny * off * side];
      if (opts.within && !inside(c, opts.within)) continue;
      const clear = (opts.avoid ?? []).every((other) => other.pts.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) > ROAD_W[other.cls] / 2 + Math.max(depth, width) / 2 + 1.2));
      if (!clear) continue;
      out.push({ x: c[0], y: c[1], w: width, h: depth, a });
    }
  }
  return out;
}

const areaFill = { town: MAP.town, park: MAP.park, wood: MAP.wood, water: MAP.water };

/** A smooth closed outline through `pts`. */
const blob = (pts: Pt[]) => `${pathD(catmull(pts, true, 8))} Z`;

/** The section of a road its name is written along, running left to right so the name reads upright. */
function labelPath(road: Road, length: number): string {
  const path = new Path(road.pts);
  const mid = road.labelAt * path.len;
  const pts: Pt[] = [];
  for (let k = -10; k <= 10; k++) pts.push(path.point(mid + (k / 10) * (length / 2)));
  if (pts[pts.length - 1][0] < pts[0][0]) pts.reverse();
  return pathD(pts);
}

/**
 * Everything on the map that doesn't move: land, water (with the app's faint
 * BLACKTOP wordmark), parks and woods, buildings, roads by importance with
 * their names, and place names. Memoised: it's drawn once per scene.
 */
export const MapLayers = memo(function MapLayers({ map, id, wordmark = true }: { map: MapDef; id: (n: string) => string; wordmark?: boolean }) {
  const order: RoadClass[] = ['minor', 'major', 'motorway'];
  const named = map.roads.filter((r) => r.name);
  return (
    <g>
      <defs>
        <pattern id={id('wm')} width={58} height={15} patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          <text x={2} y={11} fontSize={8.5} fontWeight={900} letterSpacing={1.6} style={{ fill: A }} opacity={0.075}>
            BLACKTOP
          </text>
        </pattern>
        {named.map((r, i) => (
          <path key={i} id={id(`road-name-${i}`)} d={labelPath(r, textW(r.name ?? '', 4.6) + 14)} />
        ))}
      </defs>
      <rect x={-2000} y={-2000} width={4000} height={4000} fill={MAP.land} />
      {map.areas
        .filter((a) => a.kind !== 'water')
        .map((a, i) => (
          <path key={`a${i}`} d={blob(a.pts)} fill={areaFill[a.kind]} />
        ))}
      {map.rivers?.map((r, i) => (
        <path key={`r${i}`} d={pathD(catmull(r.pts, false, 10))} fill="none" stroke={MAP.water} strokeWidth={r.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {map.areas
        .filter((a) => a.kind === 'water')
        .map((a, i) => (
          <g key={`w${i}`}>
            <path d={blob(a.pts)} fill={MAP.water} stroke={MAP.waterLine} strokeWidth={1} />
            {wordmark && <path d={blob(a.pts)} fill={`url(#${id('wm')})`} />}
          </g>
        ))}
      {map.blocks?.map((b, i) => (
        <rect key={`b${i}`} x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} rx={0.6} fill={MAP.building} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.a.toFixed(1)})`} />
      ))}
      {/* Casings under every road first, so junctions join cleanly */}
      {order.map((cls) =>
        map.roads
          .filter((r) => r.cls === cls && cls !== 'minor')
          .map((r, i) => (
            <path key={`c${cls}${i}`} d={r.d} fill="none" stroke={cls === 'motorway' ? MAP.motorwayCase : MAP.majorCase} strokeWidth={ROAD_W[cls] + 1.4} strokeLinecap="round" strokeLinejoin="round" />
          )),
      )}
      {order.map((cls) =>
        map.roads
          .filter((r) => r.cls === cls)
          .map((r, i) => (
            <path key={`f${cls}${i}`} d={r.d} fill="none" stroke={cls === 'minor' ? MAP.minor : cls === 'motorway' ? MAP.motorway : MAP.major} strokeWidth={ROAD_W[cls]} strokeLinecap="round" strokeLinejoin="round" />
          )),
      )}
      {named.map((r, i) => (
        <text key={`n${i}`} fontSize={4.6} fontWeight={600} fill={MAP.label} stroke="#000" strokeOpacity={0.9} strokeWidth={1.5} paintOrder="stroke" dy={1.6}>
          <textPath href={`#${id(`road-name-${i}`)}`} startOffset="50%" textAnchor="middle">
            {r.name}
          </textPath>
        </text>
      ))}
      {map.places?.map((p, i) => (
        <text
          key={`p${i}`}
          x={p.at[0]}
          y={p.at[1]}
          fontSize={p.size ?? 6}
          fontWeight={700}
          textAnchor="middle"
          fill={p.kind === 'water' ? MAP.waterLabel : MAP.place}
          fontStyle={p.kind === 'water' ? 'italic' : undefined}
          stroke="#000"
          strokeOpacity={0.9}
          strokeWidth={1.8}
          paintOrder="stroke"
          letterSpacing={p.kind === 'water' ? 0.6 : 0.2}
        >
          {p.text}
        </text>
      ))}
    </g>
  );
});

/** A route on the map as the app draws it: a dark casing under an accent line, the same width at any zoom. */
export function RouteLine({ d, color = A, width = 3, opacity = 1, dash, draw }: { d: string; color?: string; width?: number; opacity?: number; dash?: string; draw?: number }) {
  if (!d) return null;
  // `draw` (0..1) reveals the line from its start, for a route being planned.
  const reveal = draw != null && draw < 1 ? { pathLength: 1, strokeDasharray: `${Math.max(0.0001, draw)} 1` } : null;
  return (
    <g opacity={opacity}>
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={width + 2.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...(reveal ?? {})} />
      <path
        d={d}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={reveal?.strokeDasharray ?? dash}
        pathLength={reveal ? 1 : undefined}
      />
    </g>
  );
}

/** The rescue route: burn orange with a pulsing glow, as the map draws it. */
export function RescueLine({ d, pulse = 0.5 }: { d: string; pulse?: number }) {
  if (!d) return null;
  return (
    <g>
      <path d={d} fill="none" stroke={RESCUE} strokeOpacity={0.12 + pulse * 0.2} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={RESCUE} strokeOpacity={0.25 + pulse * 0.25} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={RESCUE} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/**
 * A rider's pin, as the map draws them (screen space): yours is solid accent
 * with a white ring; a convoy member's is tinted in their colour with their
 * letter, glowing a little bigger while they talk.
 */
export function Pin({ p, letter, member, speaking = 0, r = 5.4, opacity = 1 }: { p: Pt; letter: string; member?: string; speaking?: number; r?: number; opacity?: number }) {
  const s = 1 + 0.15 * speaking;
  return (
    <g transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${s.toFixed(3)})`} opacity={opacity}>
      {member ? (
        <>
          {speaking > 0 && <circle r={r + 3.2} style={{ fill: `hsl(${member} / ${0.35 * speaking})` }} />}
          <circle r={r} fill={BG} />
          <circle r={r} style={{ fill: `hsl(${member} / 0.24)`, stroke: `hsl(${member} / 0.55)` }} strokeWidth={1} />
          <T x={0} y={r * 0.42} anchor="middle" size={r * 1.12} weight={800} color={`hsl(${member})`}>{letter}</T>
        </>
      ) : (
        <>
          <circle r={r + 0.9} fill="#000" opacity={0.4} />
          <circle r={r} style={{ fill: A }} stroke="white" strokeWidth={1.5} />
          <T x={0} y={r * 0.42} anchor="middle" size={r * 1.12} weight={800} color="#fff">{letter}</T>
        </>
      )}
    </g>
  );
}

/** The guidance banner in the search bar's place: the turn, how far, and the time / distance left with the ETA. */
export function TurnBanner({
  I,
  dist,
  text,
  sub,
  call = 0,
  t = 0,
  opacity = 1,
  x = 8,
  y = 8,
  w = 304,
}: {
  I: Icon;
  dist: string;
  text: string;
  sub?: string;
  /** 0..1 while the turn is being called out over the radio. */
  call?: number;
  t?: number;
  opacity?: number;
  x?: number;
  y?: number;
  w?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect width={w} height={30} rx={8} style={{ fill: PANEL, stroke: `hsl(var(--accent) / ${0.45 + 0.4 * call})` }} strokeWidth={0.9} />
      <rect x={4} y={4} width={22} height={22} rx={6} style={{ fill: A }} />
      <Ico I={I} x={8.5} y={8.5} s={13} color="#111" sw={2.6} />
      <T x={32} y={14} size={10} weight={800} mono>{dist}</T>
      <T x={32 + textW(dist, 10) + 4} y={14} size={7} weight={700}>{text}</T>
      {sub && <T x={32} y={24.5} size={5.8} color={MUTED}>{sub}</T>}
      {/* The radio call going out */}
      <g transform={`translate(${w - 18} 11)`} opacity={0.35 + 0.65 * call}>
        {[0, 1, 2, 3].map((i) => {
          const h = 2 + call * 6 * Math.abs(Math.sin(t * 11 + i * 1.6));
          return <rect key={i} x={i * 2.6} y={4 - h / 2} width={1.5} height={h} rx={0.75} style={{ fill: A }} />;
        })}
      </g>
    </g>
  );
}

/** The map's speed card: the live speed, big, with its unit. */
export function SpeedCard({ x, y, value, unit, tone = INK, w = 48 }: { x: number; y: number; value: string | number; unit: string; tone?: string; w?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={30} rx={8} style={{ fill: PANEL, stroke: LINE }} strokeWidth={0.8} />
      <T x={w / 2} y={18} anchor="middle" size={14} weight={900} mono color={tone}>{value}</T>
      <T x={w / 2} y={26} anchor="middle" size={5} weight={700} color={MUTED} spacing={0.6}>{unit}</T>
    </g>
  );
}

/** A soft rain cell on the radar layer, drifting with `at`. */
export function RainCell({ at, r, id, opacity = 1, seed = 1 }: { at: Pt; r: number; id: (n: string) => string; opacity?: number; seed?: number }) {
  const lobes: Pt[] = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const k = 0.72 + 0.4 * rnd(seed * 31 + i);
    return [at[0] + Math.cos(a) * r * k * 1.25, at[1] + Math.sin(a) * r * k * 0.85];
  });
  const core: Pt[] = lobes.map((p) => [lerp(at[0], p[0], 0.55), lerp(at[1], p[1], 0.55)]);
  return (
    <g opacity={opacity} filter={`url(#${id('soft')})`}>
      <path d={blob(lobes)} fill="#38bdf8" fillOpacity={0.2} />
      <path d={blob(core)} fill="#22c55e" fillOpacity={0.22} />
    </g>
  );
}
