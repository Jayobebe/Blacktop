import { useEffect, useRef } from 'react';

/**
 * A knocked-out card burns: flames rise over it (red tips, orange body, yellow
 * core, the look of the app's Burn), sparks fly off, and what's left is ash.
 * A small canvas over the one card, alive for about a second. Callers leave it
 * out in Thermal mode and with reduced motion (the card just goes dark).
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

    const start = performance.now();
    const seed = Math.random() * 100;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; size: number }[] = [];
    let raf = 0;

    // Flame tongues: pointed tips that flicker and drift.
    const tongues = (x: number, t: number, amp: number, s: number) => {
      const a = Math.abs(Math.sin(x * 0.09 + t * 7 + s));
      const b = Math.abs(Math.sin(x * 0.21 - t * 10 + s * 1.7));
      return amp * (0.3 + 0.7 * Math.pow(a, 2.4) * (0.55 + 0.45 * b));
    };
    const layer = (top: number, t: number, amp: number, s: number, fill: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(-4, H + 4);
      for (let x = -4; x <= W + 4; x += 3) ctx.lineTo(x, top - tongues(x, t, amp, s));
      ctx.lineTo(W + 4, H + 4);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const t = (now - start) / 1000;
      // The flames climb past the top of the card by 60 %, then die back.
      const climb = 1 - Math.pow(1 - Math.min(1, p / 0.6), 2.2);
      const head = H + 12 - climb * (H * 1.05);
      const fade = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;
      const body = ctx.createLinearGradient(0, head - 20, 0, H);
      body.addColorStop(0, '#f97316');
      body.addColorStop(0.45, '#ea580c');
      body.addColorStop(1, '#7f1d1d');
      const core = ctx.createLinearGradient(0, head, 0, H);
      core.addColorStop(0, '#fde047');
      core.addColorStop(0.6, '#fbbf24');
      core.addColorStop(1, '#f97316');
      layer(head - 10, t, H * 0.2, seed, '#b91c1c');
      layer(head, t, H * 0.16, seed + 3, body);
      layer(head + H * 0.14, t, H * 0.12, seed + 7, core);

      if (p < 0.8 && sparks.length < 40) {
        for (let i = 0; i < 2; i++) sparks.push({ x: Math.random() * W, y: Math.max(0, head) + Math.random() * 20, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 110, life: 1, size: 0.8 + Math.random() * 1.6 });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx / 60;
        s.y += s.vy / 60;
        s.life -= 1 / 38;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(253, 224, 71, ${(s.life * fade).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (p >= 1) {
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
