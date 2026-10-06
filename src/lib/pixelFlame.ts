/**
 * The app's fire, as pixel art: flat colours in stacked layers (red tips,
 * orange body, yellow core, a white-hot heart) whose tops are flame tongues
 * drawn a whole block at a time, so every edge is stepped rather than smooth.
 * The Burn overlay and a burnt-out Card Wars card both draw with this, so the
 * two fires are one look at two sizes.
 */
export const FLAME = { tips: '#b91c1c', body: '#ea580c', core: '#fbbf24', heart: '#fef3c7', spark: '#fde047', char: '#140806' } as const;

/**
 * Flame tongues along x: pointed tips that flicker and lean, 0 to `amp` high.
 * `scale` stretches them (1 suits a phone-wide fire; a card wants about 4).
 */
export function tongues(x: number, t: number, amp: number, seed: number, scale = 1): number {
  const a = Math.abs(Math.sin(x * 0.021 * scale + t * 6.3 + seed));
  const b = Math.abs(Math.sin(x * 0.053 * scale - t * 9.1 + seed * 1.7));
  const c = Math.sin(x * 0.009 * scale + t * 2.2 + seed * 0.3) * 0.5 + 0.5;
  return amp * (0.35 + 0.65 * Math.pow(a, 3) * (0.55 + 0.45 * b)) * (0.7 + 0.3 * c);
}

/**
 * One layer, a column of blocks at a time from `x0` to `x1`: filled between
 * `top(x)` and `bottom(x)`, both snapped to the grid of `px`-sized blocks.
 */
export function pixelLayer(ctx: CanvasRenderingContext2D, x0: number, x1: number, px: number, top: (x: number) => number, bottom: (x: number) => number, fill: string) {
  ctx.fillStyle = fill;
  for (let x = Math.floor(x0 / px) * px; x < x1; x += px) {
    const mid = x + px / 2;
    const y0 = Math.round(top(mid) / px) * px;
    const y1 = Math.round(bottom(mid) / px) * px;
    if (y1 > y0) ctx.fillRect(x, y0, px, y1 - y0);
  }
}

/** A square spark, on the grid. */
export function pixelSpark(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, px, px);
}
