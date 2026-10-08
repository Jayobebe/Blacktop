import { useEffect, useRef } from 'react';
import { fireBox, newFire, paintCardFire } from '../lib/cardFire';

/**
 * A knocked-out card burns, in the same pixel-art fire as the app's Burn
 * (`lib/pixelFlame`): a ragged line climbs the card from the bottom leaving
 * char behind it, with stacked flat flames standing on the line (red tips,
 * orange body, yellow core, a white-hot heart), square sparks thrown off and
 * a few embers left glowing in the char (`lib/cardFire`, which a Redline
 * card's frame draws with too). A small canvas over the one card,
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
    const edge = W * (8 / 116);
    const box = fireBox(edge, W - edge, H * (70 / 172), H * (170 / 172));
    const ch = box.bottom - box.top;
    const fire = newFire(box);
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
      const line = box.bottom - climb * (ch + box.px * 2);
      const life = p < 0.68 ? Math.min(1, p / 0.08) : Math.max(0, 1 - (p - 0.68) / 0.3);

      ctx.clearRect(0, 0, W, H);
      paintCardFire(ctx, box, fire, t, dt, line, life, p < 0.7);

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
