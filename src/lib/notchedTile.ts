/**
 * The outline of a Home ride tile with the globe's notch cut out of it: a
 * rounded rectangle minus a circle, with the two corners where the circle
 * meets the tile's edges rounded off (`fillet`), so every corner of the tile
 * is soft like its own rounded ones. One path serves as the tile's mask (what
 * shows) and, inset by half a stroke, as its drawn outline, so straight edges,
 * curves and the notch are all one line of one width (the tile's CSS border
 * and a separate circle used to meet at different weights). Imports nothing.
 *
 * Coordinates are the tile's own (0,0 top left, y down). The outline is walked
 * clockwise as straight pieces (corners cut into short ones), the two places
 * it crosses the circle are found, and each gets a fillet circle touching the
 * edge and the notch. When the circle doesn't cross the outline exactly twice,
 * the plain shape (no fillets) is returned.
 */
type P = { x: number; y: number };

export interface NotchShape {
  /** SVG path data. */
  d: string;
  /** Whether the notch was cut with fillets (false: the plain rect-minus-circle fallback, evenodd). */
  filleted: boolean;
}

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const f2 = (n: number) => Math.round(n * 100) / 100;
const pt = (p: P) => `${f2(p.x)},${f2(p.y)}`;

/** The rounded rectangle inset by `ins`, clockwise from the top edge, corners as short pieces. */
function outline(w: number, h: number, radius: number, ins: number): P[] {
  const x0 = ins, y0 = ins, x1 = w - ins, y1 = h - ins;
  const r = Math.max(0, Math.min(radius - ins, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: P[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = from + (i / n) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2); // top right
  corner(x1 - r, y1 - r, 0); // bottom right
  corner(x0 + r, y1 - r, Math.PI / 2); // bottom left
  corner(x0 + r, y0 + r, Math.PI); // top left
  return pts;
}

function plain(w: number, h: number, radius: number, ins: number, o: P, q: number): string {
  const pts = outline(w, h, radius, ins);
  const ring = `M${pts.map(pt).join('L')}Z`;
  return `${ring} M${f2(o.x + q)},${f2(o.y)} A${f2(q)},${f2(q)} 0 1 0 ${f2(o.x - q)},${f2(o.y)} A${f2(q)},${f2(q)} 0 1 0 ${f2(o.x + q)},${f2(o.y)}Z`;
}

/**
 * The tile `w` × `h` with corner `radius`, minus the circle at `o` of radius
 * `hole`, its meeting corners rounded by `fillet`, all inset by `ins` (half
 * the stroke for an outline; 0 for the mask).
 */
export function notchedTilePath(w: number, h: number, radius: number, o: P, hole: number, fillet: number, ins = 0): NotchShape {
  const q = hole + ins;
  const f = Math.max(0, fillet - ins);
  const pts = outline(w, h, radius, ins);
  const n = pts.length;
  const inside = (p: P) => len(sub(p, o)) < q;
  // Every place a piece of the outline crosses the circle, in order round it.
  const events: { seg: number; at: P; enter: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const d = sub(b, a);
    const A = dot(d, d);
    if (A < 1e-9) continue;
    const m = sub(a, o);
    const B = 2 * dot(m, d);
    const C = dot(m, m) - q * q;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) continue;
    const s = Math.sqrt(disc);
    for (const t of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) {
      if (t < 0 || t >= 1) continue;
      const at = add(a, mul(d, t));
      // Entering the circle if just past the crossing is inside it.
      events.push({ seg: i, at, enter: inside(add(a, mul(d, Math.min(1, t + 1e-3)))) });
    }
  }
  // The circle doesn't reach the tile (portrait Track Day): just the rounded tile.
  if (!events.length && (o.x < ins - q || o.x > w - ins + q || o.y < ins - q || o.y > h - ins + q || !inside({ x: Math.min(Math.max(o.x, ins), w - ins), y: Math.min(Math.max(o.y, ins), h - ins) }))) {
    return { d: `M${pts.map(pt).join('L')}Z`, filleted: false };
  }
  if (events.length !== 2 || events[0].enter === events[1].enter) {
    return { d: plain(w, h, radius, ins, o, q), filleted: false };
  }
  const enter = events.find((e) => e.enter)!;
  const exit = events.find((e) => !e.enter)!;
  const dirOf = (seg: number) => unit(sub(pts[(seg + 1) % n], pts[seg]));
  // Walking clockwise with y down, the tile is on the right-hand side: the normal (-dy, dx) points into it.
  const filletAt = (e: { seg: number; at: P }, before: boolean) => {
    const d = dirOf(e.seg);
    const nrm = { x: -d.y, y: d.x };
    const A0 = sub(add(e.at, mul(nrm, f)), o);
    const bq = dot(A0, d);
    const cq = dot(A0, A0) - (q + f) * (q + f);
    const disc = Math.max(0, bq * bq - cq);
    const t = before ? -bq - Math.sqrt(disc) : -bq + Math.sqrt(disc);
    const c = add(add(e.at, mul(nrm, f)), mul(d, t));
    return { edge: sub(c, mul(nrm, f)), rim: add(o, mul(unit(sub(c, o)), q)), t };
  };
  const into = filletAt(enter, true);
  const out = filletAt(exit, false);
  // The outline from just after the exit's fillet round to just before the entry's.
  const path: string[] = [`M${pt(out.edge)}`];
  // Points exit.seg+1 … enter.seg; when both crossings are on one edge, that's the whole way round.
  const count = ((enter.seg - exit.seg) % n + n) % n || n;
  for (let k = 1; k <= count; k++) path.push(`L${pt(pts[(exit.seg + k) % n])}`);
  path.push(`L${pt(into.edge)}`);
  // Fillet (turning right, clockwise on screen), the notch (turning left), fillet again.
  path.push(`A${f2(f)},${f2(f)} 0 0 1 ${pt(into.rim)}`);
  const a1 = Math.atan2(into.rim.y - o.y, into.rim.x - o.x);
  const a2 = Math.atan2(out.rim.y - o.y, out.rim.x - o.x);
  const sweep = (((a1 - a2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  path.push(`A${f2(q)},${f2(q)} 0 ${sweep > Math.PI ? 1 : 0} 0 ${pt(out.rim)}`);
  path.push(`A${f2(f)},${f2(f)} 0 0 1 ${pt(out.edge)}Z`);
  return { d: path.join(''), filleted: true };
}
