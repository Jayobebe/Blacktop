import { useEffect, useRef } from 'react';
import { FLAME, pixelLayer, pixelSpark, tongues } from '@/lib/pixelFlame';

/**
 * A knocked-out card burns, in the same pixel-art fire as the app's Burn
 * (`lib/pixelFlame`): a ragged line climbs the card from the bottom leaving
 * char behind it, with stacked flat flames standing on the line (red tips,
 * orange body, yellow core, a white-hot heart), square sparks thrown off and
 * a few embers left glowing in the char. A small canvas over the one card,
 * with room above for the flames, alive for a little over a second. Callers
 * leave it out in Thermal mode and with reduced motion (the card just goes dark).
 */
export function CardBurn({ duration = 1150, onDone }: { duration?: number; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // The canvas overhangs the card (see .cw-burn): this is where the card sits in it.
    const left = W * (8 / 116);
    const right = W - left;
    const top = H * (70 / 172);
    const bottom = H * (170 / 172);
    const cw = right - left;
    const ch = bottom - top;
    // About 34 blocks across a card, whatever its size.
    const px = Math.max(2, Math.round(cw / 34));
    // Tongues are tuned for a phone-wide fire: tighten them to a card.
    const scale = 420 / cw;

    const seed = Math.random() * 100;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    const embers = Array.from({ length: 9 }, () => ({ x: left + Math.random() * cw, y: Math.random(), phase: Math.random() * 6 }));
    const start = performance.now();
    let last = start;
    let raf = 0;

    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // The line reaches the top of the card at 60 %; then the flames sink into it and go out.
      const climb = 1 - Math.pow(1 - Math.min(1, p / 0.6), 2);
      const line = bottom - climb * (ch + px * 2);
      const life = p < 0.68 ? Math.min(1, p / 0.08) : Math.max(0, 1 - (p - 0.68) / 0.3);
      // The burn line: lumpy and restless, never a straight edge.
      const front = (x: number) => Math.max(top - px, line + Math.sin(x * 0.05 * scale + seed) * ch * 0.05 + Math.sin(x * 0.13 * scale - t * 4 + seed * 2) * ch * 0.03);

      ctx.clearRect(0, 0, W, H);

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
      if (p < 0.7 && sparks.length < 26 && Math.random() < 0.7) {
        const x = left + Math.random() * cw;
        sparks.push({ x, y: front(x) - Math.random() * ch * 0.2, vx: (Math.random() - 0.5) * cw * 0.6, vy: -ch * (0.7 + Math.random() * 0.9), life: 1 });
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

      if (p >= 1) {
        ctx.clearRect(0, 0, W, H);
        done.current?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return <canvas ref={ref} className="cw-burn" aria-hidden />;
}
