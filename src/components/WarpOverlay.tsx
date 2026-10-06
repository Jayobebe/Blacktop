import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clearWarp, useWarp } from '@/lib/warp';

/** One block of the warp is this many CSS px: it's drawn small and scaled up, sharp-edged. */
const BLOCK = 5;
/** The approach: the page turns to pixels, pulls back like a catapult being drawn, then is fired into the globe. */
const PIXEL_MS = 130;
const PULL_MS = 360;
const SLING_MS = 340;
export const WARP_APPROACH_MS = PIXEL_MS + PULL_MS + SLING_MS;
/** When the page underneath can change without being seen: partway into the slingshot. */
export const WARP_SWITCH_MS = PIXEL_MS + PULL_MS + 110;
/** It runs at least this long, however fast the destination is ready. */
const MIN_MS = WARP_APPROACH_MS + 260;
const OUT_MS = 420;
const STARS = 150;
const DARK = '#050506';

const cssHsl = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${(v || fallback).split(/\s+/).join(', ')})`;
};
const seen = (color: string) => !!color && color !== 'transparent' && !/,\s*0(\.0+)?\)$/.test(color);

/**
 * The page as it stands, drawn small: every box's fill and outline, text as
 * bars in its own colour, icons as blocks, and pictures and canvases (the
 * globe, stickers) copied across. Scaled up without smoothing it reads as the
 * same screen in pixels. One pass over what's on screen; no library.
 */
function snapshot(W: number, H: number, skip: HTMLElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);
  const root = document.getElementById('root');
  if (!root) return out;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let count = 0;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let node = walk.nextNode() as HTMLElement | null; node && count < 700; node = walk.nextNode() as HTMLElement | null) {
    if (node === skip) continue;
    const r = node.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    count++;
    const x = r.left / BLOCK;
    const y = r.top / BLOCK;
    const w = r.width / BLOCK;
    const h = r.height / BLOCK;
    const tag = node.tagName;
    try {
      if (tag === 'CANVAS') {
        // The globe (not a full-screen layer like the backdrop, which may hold nothing to copy).
        if (r.width < vw * 0.8) ctx.drawImage(node as unknown as HTMLCanvasElement, x, y, w, h);
        continue;
      }
      if (tag === 'IMG') {
        const img = node as unknown as HTMLImageElement;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
        continue;
      }
    } catch {
      continue;
    }
    const cs = getComputedStyle(node);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (tag === 'svg' || tag === 'SVG') {
      if (r.width > 80) continue;
      ctx.fillStyle = cs.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(Math.round(x + w * 0.2), Math.round(y + h * 0.2), Math.max(1, Math.round(w * 0.6)), Math.max(1, Math.round(h * 0.6)));
      ctx.globalAlpha = 1;
      continue;
    }
    const radius = Math.min((parseFloat(cs.borderTopLeftRadius) || 0) / BLOCK, w / 2, h / 2);
    const box = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
    };
    if (seen(cs.backgroundColor) && r.width < vw * 0.98) {
      ctx.fillStyle = cs.backgroundColor;
      box();
      ctx.fill();
    }
    const border = parseFloat(cs.borderTopWidth) || 0;
    if (border > 0 && cs.borderTopStyle !== 'none' && seen(cs.borderTopColor)) {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = Math.max(0.6, border / BLOCK);
      box();
      ctx.stroke();
    }
    // Text: a bar where the words are.
    const own = Array.from(node.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim().length > 0);
    if (own) {
      ctx.fillStyle = cs.color;
      ctx.globalAlpha = 0.85;
      const size = Math.max(1, Math.round(((parseFloat(cs.fontSize) || 12) * 0.62) / BLOCK));
      const pad = (parseFloat(cs.paddingLeft) || 0) / BLOCK;
      ctx.fillRect(Math.round(x + pad), Math.round(y + (h - size) / 2), Math.max(2, Math.round(w - pad * 2)), size);
      ctx.globalAlpha = 1;
    }
  }
  return out;
}

/**
 * The jump into Blacktop World. The page turns to pixels and draws back from
 * the globe like a catapult being pulled, then is fired into it: the globe
 * rushes up to swallow the screen, the rider is flung down a tunnel of streaks
 * in the app's own colours round the globe's ring, and it clears in a flash
 * once World has drawn. A small canvas scaled up without smoothing, so it
 * costs next to nothing while the page underneath changes. Portaled to <body>,
 * above the page and below the alarm.
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
    canvas.style.opacity = '0';
    const cx = first.x / BLOCK;
    const cy = first.y / BLOCK;
    const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const accent = cssHsl('--accent', '38 95% 55%');
    const burn = cssHsl('--burn', '15 85% 52%');
    const page = snapshot(W, H, canvas);
    // For the pixels to grow: the page copied smaller still, then blown back up.
    const coarse = document.createElement('canvas');
    const coarseCtx = coarse.getContext('2d')!;
    // Each streak: its bearing from the globe, how far out it is, its own pace and colour.
    const stars = Array.from({ length: STARS }, () => {
      const pick = Math.random();
      return { a: Math.random() * Math.PI * 2, r: 1 + Math.random() * reach, v: 0.5 + Math.random(), color: pick < 0.55 ? accent : pick < 0.8 ? '#f4f4f5' : burn };
    });
    let raf = 0;
    let last = performance.now();

    const tunnel = (t: number, dt: number, glow: number) => {
      const speed = 2.2 + 4 * Math.min(1, t / 700) ** 2;
      ctx.lineWidth = 1;
      ctx.globalAlpha = glow;
      for (const s of stars) {
        const from = s.r;
        s.r += s.r * s.v * speed * dt + 4 * dt;
        if (s.r > reach + 6) {
          s.r = 1 + Math.random() * 5;
          s.a = Math.random() * Math.PI * 2;
          continue;
        }
        ctx.strokeStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(Math.round(cx + Math.cos(s.a) * from) + 0.5, Math.round(cy + Math.sin(s.a) * from) + 0.5);
        // Streaks stretch with speed.
        const tail = s.r + (s.r - from) * 1.6;
        ctx.lineTo(Math.round(cx + Math.cos(s.a) * tail) + 0.5, Math.round(cy + Math.sin(s.a) * tail) + 0.5);
        ctx.stroke();
      }
      // The globe's ring at the mouth of it, breathing a little.
      const ring = Math.min(W, H) * (0.1 + 0.05 * Math.min(1, t / 900)) + Math.sin(t / 130) * 0.6;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = burn;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ring + 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = DARK;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, ring - 1.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return ring;
    };

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

      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      ctx.fillStyle = DARK;
      ctx.fillRect(0, 0, W, H);
      let ring = 0;

      if (t < WARP_APPROACH_MS) {
        // How far the page has pulled back, or been flung forward, about the globe.
        let scale = 1;
        let fling = 0;
        if (t >= PIXEL_MS + PULL_MS) {
          fling = (t - PIXEL_MS - PULL_MS) / SLING_MS;
          scale = 0.84 + 46 * fling ** 4;
        } else if (t >= PIXEL_MS) {
          const u = (t - PIXEL_MS) / PULL_MS;
          scale = 1 - 0.16 * (1 - (1 - u) ** 3);
        }
        // The pixels grow as it goes.
        const grain = 1 + 1.7 * Math.min(1, t / (PIXEL_MS + PULL_MS));
        coarse.width = Math.max(8, Math.round(W / grain));
        coarse.height = Math.max(8, Math.round(H / grain));
        coarseCtx.imageSmoothingEnabled = false;
        coarseCtx.drawImage(page, 0, 0, coarse.width, coarse.height);
        ctx.drawImage(coarse, cx - cx * scale, cy - cy * scale, W * scale, H * scale);
        if (fling > 0) {
          // Fired: the tunnel comes up through the page as it tears past.
          ctx.fillStyle = DARK;
          ctx.globalAlpha = Math.min(1, fling ** 2 * 1.4);
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
          ring = tunnel(t - PIXEL_MS - PULL_MS, dt, Math.min(1, fling * 1.5));
        }
        canvas.style.opacity = String(Math.min(1, t / PIXEL_MS));
      } else {
        ring = tunnel(t - PIXEL_MS - PULL_MS, dt, 1);
        // Arrival: the ring's light floods out, then the whole thing lets go of the screen.
        if (out > 0) {
          ctx.fillStyle = accent;
          ctx.globalAlpha = (out < 0.35 ? out / 0.35 : 1) * 0.9;
          ctx.beginPath();
          ctx.arc(cx, cy, ring + reach * Math.min(1, out / 0.45), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        canvas.style.opacity = String(out < 0.45 ? 1 : 1 - (out - 0.45) / 0.55);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  return createPortal(<canvas ref={ref} aria-hidden className="fixed inset-0 z-[9000] h-full w-full" style={{ imageRendering: 'pixelated' }} />, document.body);
}
