import { useEffect, useRef } from 'react';

/** A soft round glow in one colour, drawn once and stamped for every particle. */
function glow(rgb: string, core = 0.25): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, `rgba(${rgb}, 1)`);
  fill.addColorStop(core, `rgba(${rgb}, 0.75)`);
  fill.addColorStop(0.6, `rgba(${rgb}, 0.22)`);
  fill.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  return c;
}

interface Flame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  rate: number;
  size: number;
  sway: number;
}
interface Spark {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * A knocked-out card burns. A ragged ember line climbs it from the bottom,
 * leaving char behind; flames lick up off the line (hundreds of soft glows
 * added together, white-hot at the root, orange, then red as they thin out),
 * sparks spit off with short trails, and smoke rolls away as it dies down.
 * A small canvas over the one card, alive for a little over a second. Callers
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

    // The canvas overhangs the card (see .cw-burn): this is where the card sits in it.
    const left = W * (8 / 116);
    const right = W - left;
    const top = H * (70 / 172);
    const bottom = H * (170 / 172);
    const cw = right - left;
    const ch = bottom - top;
    const unit = cw / 100;

    const hot = glow('255, 244, 200', 0.4);
    const yellow = glow('253, 200, 60');
    const orange = glow('249, 115, 22');
    const red = glow('190, 30, 20');
    const smoke = glow('40, 36, 34', 0.5);

    const seed = Math.random() * 1000;
    // The burn line's shape: slow lumps plus a fast flicker, so it's never a straight edge.
    const ragged = (x: number, t: number) =>
      Math.sin(x * 0.045 + seed) * 7 * unit + Math.sin(x * 0.11 - t * 3 + seed * 1.7) * 4 * unit + Math.sin(x * 0.27 + t * 9 + seed * 0.3) * 2 * unit;

    const flames: Flame[] = [];
    const sparks: Spark[] = [];
    const puffs: Flame[] = [];
    const start = performance.now();
    let last = start;
    let raf = 0;

    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // The line reaches the top of the card at 62 %, then everything dies back.
      const climb = 1 - Math.pow(1 - Math.min(1, p / 0.62), 2);
      const line = bottom - climb * (ch + 10 * unit);
      const fade = p < 0.74 ? 1 : 1 - (p - 0.74) / 0.26;
      const feeding = p < 0.7;
      const front = (x: number) => line + ragged(x, t);

      ctx.clearRect(0, 0, W, H);

      // Char: what the line has passed over goes black, with a ragged top.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.78 * fade;
      ctx.fillStyle = '#0b0605';
      ctx.beginPath();
      ctx.moveTo(left, bottom);
      for (let x = left; x <= right; x += 3) ctx.lineTo(x, Math.max(top, Math.min(bottom, front(x))));
      ctx.lineTo(right, bottom);
      ctx.closePath();
      ctx.fill();

      // Smoke, behind the fire.
      if (p > 0.25 && p < 0.9 && puffs.length < 26 && Math.random() < 0.6) {
        const x = left + Math.random() * cw;
        puffs.push({ x, y: Math.max(top, front(x)) - 4 * unit, vx: (Math.random() - 0.5) * 14 * unit, vy: -(26 + Math.random() * 30) * unit, life: 1, rate: 0.9 + Math.random() * 0.5, size: (16 + Math.random() * 18) * unit, sway: Math.random() * 6 });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const s = puffs[i];
        s.life -= s.rate * dt;
        if (s.life <= 0) {
          puffs.splice(i, 1);
          continue;
        }
        s.x += (s.vx + Math.sin(t * 2 + s.sway) * 6 * unit) * dt;
        s.y += s.vy * dt;
        const size = s.size * (1.7 - s.life * 0.7);
        ctx.globalAlpha = Math.min(1, s.life * 1.4) * 0.42 * Math.max(fade, 0.35);
        ctx.drawImage(smoke, s.x - size, s.y - size, size * 2, size * 2);
      }

      ctx.globalCompositeOperation = 'lighter';

      // The ember line itself: a hot seam along the edge of the char.
      if (fade > 0) {
        for (let x = left; x <= right; x += 5 * unit) {
          const y = front(x);
          if (y < top - 2 || y > bottom) continue;
          const flicker = 0.55 + 0.45 * Math.abs(Math.sin(x * 0.4 + t * 14 + seed));
          const size = (5 + flicker * 4) * unit;
          ctx.globalAlpha = fade * flicker * 0.7;
          ctx.drawImage(orange, x - size * 1.6, y - size, size * 3.2, size * 2);
          ctx.globalAlpha = fade * flicker * 0.55;
          ctx.drawImage(hot, x - size * 0.7, y - size * 0.45, size * 1.4, size * 0.9);
        }
      }

      // Flames: born on the line, rising and thinning.
      if (feeding) {
        const births = Math.round(520 * dt * (0.55 + 0.45 * Math.sin(t * 11 + seed) ** 2)) + 2;
        for (let i = 0; i < births && flames.length < 280; i++) {
          const x = left + Math.random() * cw;
          // Taller in tongues, so the fire has peaks rather than a level top.
          const tongue = Math.pow(Math.abs(Math.sin(x * 0.07 + t * 5 + seed)) * Math.abs(Math.sin(x * 0.023 - t * 2.3 + seed * 2)), 1.5);
          flames.push({
            x,
            y: Math.min(bottom, front(x)) + Math.random() * 6 * unit,
            vx: (Math.random() - 0.5) * 16 * unit,
            vy: -(45 + Math.random() * 45 + tongue * 150) * unit,
            life: 1,
            rate: 2.2 + Math.random() * 1.6 - tongue * 1.1,
            size: (6 + Math.random() * 7 + tongue * 5) * unit,
            sway: Math.random() * 6,
          });
        }
      }
      for (let i = flames.length - 1; i >= 0; i--) {
        const f = flames[i];
        f.life -= f.rate * dt;
        if (f.life <= 0) {
          flames.splice(i, 1);
          continue;
        }
        f.x += (f.vx + Math.sin(t * 9 + f.sway) * 12 * unit) * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 0.6 * dt;
        const size = f.size * (0.35 + f.life * 0.75);
        const sprite = f.life > 0.86 ? hot : f.life > 0.6 ? yellow : f.life > 0.28 ? orange : red;
        // Thin out before the canvas's top edge, whatever the card's size.
        const room = Math.min(1, Math.max(0, f.y / (H * 0.12)));
        ctx.globalAlpha = Math.min(1, f.life * 1.6) * 0.27 * fade * room;
        // Stretched upwards: a lick of flame, not a ball.
        ctx.drawImage(sprite, f.x - size * 0.7, f.y - size * 1.9, size * 1.4, size * 3.2);
      }

      // Sparks, with a short trail each.
      if (feeding && sparks.length < 36 && Math.random() < 0.75) {
        const x = left + Math.random() * cw;
        const y = Math.min(bottom, front(x));
        sparks.push({ x, y, px: x, py: y, vx: (Math.random() - 0.5) * 90 * unit, vy: -(90 + Math.random() * 150) * unit, life: 1 });
      }
      ctx.lineCap = 'round';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= 1.5 * dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.px = s.x;
        s.py = s.y;
        s.vx += Math.sin(t * 13 + i) * 60 * unit * dt;
        s.vy += 60 * unit * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = Math.min(1, s.life * 1.5) * Math.max(fade, 0.5);
        ctx.strokeStyle = s.life > 0.5 ? '#fff3c4' : '#fb923c';
        ctx.lineWidth = Math.max(0.8, 1.6 * unit * s.life);
        ctx.beginPath();
        ctx.moveTo(s.px - s.vx * dt * 1.5, s.py - s.vy * dt * 1.5);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

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
