import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clearWarp, useWarp } from '@/lib/warp';

/** One block of the warp is this many CSS px: it's drawn small and scaled up, sharp-edged. */
const BLOCK = 5;
/** It runs at least this long, however fast the destination is ready. */
const MIN_MS = 850;
const IN_MS = 320;
const OUT_MS = 420;
const STARS = 150;

/**
 * The warp into Blacktop World, wormhole-film style in pixel art: the screen
 * falls dark from the globe outward, stars streak past from that point faster
 * and faster round a bright lensed ring, and it clears in a flash once World
 * has drawn. A small canvas scaled up without smoothing, so it costs next to
 * nothing while the page underneath changes. Portaled to <body>, above the
 * page and below the alarm.
 */
export function WarpOverlay() {
  const warp = useWarp();
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(warp);
  live.current = warp;
  const on = !!warp;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    const first = live.current;
    if (!on || !canvas || !ctx || !first) return;
    const W = Math.max(40, Math.ceil(window.innerWidth / BLOCK));
    const H = Math.max(40, Math.ceil(window.innerHeight / BLOCK));
    canvas.width = W;
    canvas.height = H;
    const cx = first.x / BLOCK;
    const cy = first.y / BLOCK;
    const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    // Each star: its bearing from the centre, how far out it is, its own pace and tint.
    const stars = Array.from({ length: STARS }, () => ({ a: Math.random() * Math.PI * 2, r: 1 + Math.random() * reach, v: 0.5 + Math.random(), hue: Math.random() }));
    const tint = (hue: number, light: number) => (hue < 0.62 ? `rgba(${light},${light},${Math.min(255, light + 30)},1)` : hue < 0.85 ? `rgba(255,${Math.round(light * 0.62)},${Math.round(light * 0.25)},1)` : `rgba(${Math.round(light * 0.55)},${Math.round(light * 0.8)},255,1)`);
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const w = live.current;
      if (!w) return;
      const t = now - w.startedAt;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The run ends once the destination is ready and the least time is up.
      const outFrom = w.endAt === null ? null : Math.max(w.endAt, w.startedAt + MIN_MS);
      const out = outFrom === null ? 0 : Math.min(1, Math.max(0, (now - outFrom) / OUT_MS));
      if (out >= 1) {
        clearWarp();
        return;
      }
      const into = Math.min(1, t / IN_MS);
      // Speed builds over the first second, then holds.
      const speed = 0.6 + 5.4 * Math.min(1, t / 1000) ** 2;

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      // The dark opens from the globe outward.
      ctx.fillStyle = '#04050a';
      if (into < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, reach * into * into + 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(0, 0, W, H);

      ctx.save();
      if (into < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, reach * into * into + 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.lineWidth = 1;
      for (const s of stars) {
        const from = s.r;
        s.r += s.r * s.v * speed * dt + 4 * dt;
        if (s.r > reach + 6) {
          s.r = 1 + Math.random() * 5;
          s.a = Math.random() * Math.PI * 2;
          continue;
        }
        const near = Math.min(1, s.r / reach);
        const light = Math.round(110 + 145 * near);
        ctx.strokeStyle = tint(s.hue, light);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx + Math.cos(s.a) * from) + 0.5, Math.round(cy + Math.sin(s.a) * from) + 0.5);
        // Streaks stretch with speed: a dot at rest, a long line at full pace.
        const tail = s.r + (s.r - from) * 1.6;
        ctx.lineTo(Math.round(cx + Math.cos(s.a) * tail) + 0.5, Math.round(cy + Math.sin(s.a) * tail) + 0.5);
        ctx.stroke();
      }
      // The lensed ring round the mouth of it, breathing a little.
      const ring = Math.min(W, H) * (0.1 + 0.05 * Math.min(1, t / 900)) + Math.sin(t / 130) * 0.6;
      ctx.strokeStyle = 'rgba(255,214,170,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(245,110,40,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ring + 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#04050a';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, ring - 1.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Arrival: the ring's light floods out, then the whole thing lets go of the screen.
      if (out > 0) {
        ctx.fillStyle = `rgba(255,236,214,${(out < 0.35 ? out / 0.35 : 1) * 0.9})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ring + reach * Math.min(1, out / 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      canvas.style.opacity = String(out < 0.45 ? 1 : 1 - (out - 0.45) / 0.55);
      raf = requestAnimationFrame(frame);
    };
    canvas.style.opacity = '1';
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  return createPortal(<canvas ref={ref} aria-hidden className="fixed inset-0 z-[9000] h-full w-full" style={{ imageRendering: 'pixelated' }} />, document.body);
}
