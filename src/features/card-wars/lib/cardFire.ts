import { FLAME, pixelLayer, pixelSpark, tongues } from '@/lib/pixelFlame';

/**
 * A card on fire, in the app's pixel-art flames (`lib/pixelFlame`): char below
 * a lumpy, restless burn line, a few embers glowing in it, four flat layers of
 * flame standing on the line (red tips, orange body, yellow core, a white-hot
 * heart) and square sparks thrown off. One painter for the two places a card
 * burns: a knocked-out card in a battle (`CardBurn`, where the line climbs the
 * card) and the frame of a Redline card (`redlineFire`, where it holds).
 */

/** Where the card sits on the canvas, the size of a block, and how tight the tongues are for a card this wide. */
export interface FireBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  px: number;
  scale: number;
}

export interface FireState {
  seed: number;
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[];
  embers: { x: number; y: number; phase: number }[];
}

/** About 34 blocks across a card, whatever its size; tongues are tuned for a phone-wide fire and tightened to it. */
export function fireBox(left: number, right: number, top: number, bottom: number, px = Math.max(2, Math.round((right - left) / 34))): FireBox {
  return { left, right, top, bottom, px, scale: 420 / ((right - left) / px) / px };
}

export function newFire(box: FireBox, random: () => number = Math.random): FireState {
  const cw = box.right - box.left;
  return { seed: random() * 100, sparks: [], embers: Array.from({ length: 9 }, () => ({ x: box.left + random() * cw, y: random(), phase: random() * 6 })) };
}

/**
 * One frame. `line` is how high the burn line stands (a y on the canvas),
 * `life` how alive the flames are (0 to 1), `spawn` whether new sparks fly.
 * The caller clears the canvas first.
 */
export function paintCardFire(ctx: CanvasRenderingContext2D, box: FireBox, st: FireState, t: number, dt: number, line: number, life: number, spawn: boolean, random: () => number = Math.random) {
  const { left, right, top, bottom, px, scale } = box;
  const cw = right - left;
  const ch = bottom - top;
  const { seed, sparks, embers } = st;
  // The burn line: lumpy and restless, never a straight edge.
  const front = (x: number) => Math.max(top - px, line + Math.sin(x * 0.05 * scale + seed) * ch * 0.05 + Math.sin(x * 0.13 * scale - t * 4 + seed * 2) * ch * 0.03);

  // Char: what the line has passed.
  ctx.globalAlpha = 0.82 * Math.min(1, life + 0.25);
  pixelLayer(ctx, left, right, px, front, () => bottom, FLAME.char);
  ctx.globalAlpha = 1;
  for (const e of embers) {
    const y = bottom - e.y * ch * 0.9;
    if (y > front(e.x) + px * 2 && Math.sin(t * 9 + e.phase) > 0.2 && life > 0.1) pixelSpark(ctx, e.x, y, px, e.phase > 3 ? FLAME.body : FLAME.tips);
  }

  // The fire, standing on the line: four flat layers, each shorter and hotter than the last.
  if (life > 0) {
    const base = (x: number) => Math.min(bottom, front(x) + px * 2);
    const flame = (amp: number, s: number, lift: number, fill: string) =>
      pixelLayer(ctx, left - px, right + px, px, (x) => base(x) - (tongues(x, t * 1.5, ch * amp, seed + s, scale) + ch * lift) * life, base, fill);
    flame(0.62, 0, 0.1, FLAME.tips);
    flame(0.46, 3, 0.07, FLAME.body);
    flame(0.3, 7, 0.04, FLAME.core);
    flame(0.14, 11, 0.015, FLAME.heart);
  }

  // Sparks: square, flung up and out, flickering between two colours.
  if (spawn && sparks.length < 26 && random() < 0.7) {
    const x = left + random() * cw;
    sparks.push({ x, y: front(x) - random() * ch * 0.2, vx: (random() - 0.5) * cw * 0.6, vy: -ch * (0.7 + random() * 0.9), life: 1 });
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= 1.7 * dt;
    if (s.life <= 0 || s.y < px) {
      sparks.splice(i, 1);
      continue;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += ch * 0.9 * dt;
    if (s.life > 0.25 || Math.floor(t * 20 + i) % 2) pixelSpark(ctx, s.x, s.y, px, s.life > 0.55 ? FLAME.spark : FLAME.body);
  }
}
