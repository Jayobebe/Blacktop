import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clearWarp, useWarp } from '@/lib/warp';

/** One block of the warp is this many CSS px: it's drawn small and scaled up, sharp-edged. */
const BLOCK = 5;
/** Leaving: the page turns to pixels and draws back from the globe. */
const PIXEL_MS = 130;
const PULL_MS = 360;
/** When the page underneath can change without being seen: once it's fully in pixels and pulled back. */
export const WARP_SWITCH_MS = PIXEL_MS + PULL_MS;
/** Arriving: the old page's pixels give way to the new page's, which closes back in until it's sharp, then lets go. */
const CROSS_MS = 200;
const ZOOM_MS = 380;
const CLEAR_MS = 150;
/** How far back it pulls, and how coarse the pixels get (in blocks). */
const BACK = 0.84;
const GRAIN = 2.7;
const DARK = '#050506';

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
  /** The next element that isn't inside the current one. */
  const past = (): HTMLElement | null => {
    for (;;) {
      const sibling = walk.nextSibling();
      if (sibling) return sibling as HTMLElement;
      if (!walk.parentNode()) return null;
    }
  };
  let node = walk.nextNode() as HTMLElement | null;
  while (node && count < 700) {
    const r = node.getBoundingClientRect();
    // A panel that's mostly off to one side (the next card of a swipe deck, cut off by its track): none of it is drawn.
    if (r.width > 60 && Math.min(r.right, vw) - Math.max(r.left, 0) < r.width * 0.25) {
      node = past();
      continue;
    }
    const el = node;
    node = walk.nextNode() as HTMLElement | null;
    if (el === skip) continue;
    if (r.width < 3 || r.height < 3 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    count++;
    const x = r.left / BLOCK;
    const y = r.top / BLOCK;
    const w = r.width / BLOCK;
    const h = r.height / BLOCK;
    const tag = el.tagName;
    try {
      if (tag === 'CANVAS') {
        // A globe, a game board: copied as it is. Not a full-screen layer like the backdrop, which may hold nothing to copy.
        if (!(r.width >= vw * 0.98 && r.height >= vh * 0.9)) ctx.drawImage(el as unknown as HTMLCanvasElement, x, y, w, h);
        continue;
      }
      if (tag === 'IMG') {
        const img = el as unknown as HTMLImageElement;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
        continue;
      }
    } catch {
      continue;
    }
    const cs = getComputedStyle(el);
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
    const own = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim().length > 0);
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
 * The jump into Blacktop World (and nothing else, yet). Home turns to pixels
 * and draws back from the globe; while it's held there the page underneath
 * changes; then the old page's pixels fade into World's, and those close back
 * in, getting finer, until the copy matches the real page and lets go of it.
 * So the wait for World to load is spent on the way in. A small canvas scaled
 * up without smoothing, which costs next to nothing. Portaled to <body>, above
 * the page and below the alarm.
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
    const from = snapshot(W, H, canvas);
    // The page it arrives at, copied once that page says it has drawn.
    let to: HTMLCanvasElement | null = null;
    let arrivedAt = 0;
    let heldScale = BACK;
    // For the pixels to grow: a page copied smaller still, then blown back up.
    const coarse = document.createElement('canvas');
    const coarseCtx = coarse.getContext('2d')!;
    let raf = 0;

    /** A page copy, about the globe, at this size, this coarse and this strong. */
    const draw = (page: HTMLCanvasElement, scale: number, grain: number, alpha: number) => {
      if (alpha <= 0) return;
      coarse.width = Math.max(8, Math.round(W / grain));
      coarse.height = Math.max(8, Math.round(H / grain));
      coarseCtx.imageSmoothingEnabled = false;
      coarseCtx.drawImage(page, 0, 0, coarse.width, coarse.height);
      ctx.globalAlpha = alpha;
      ctx.drawImage(coarse, cx - cx * scale, cy - cy * scale, W * scale, H * scale);
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const w = live.current;
      if (!w) return;
      const t = now - w.startedAt;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      ctx.fillStyle = DARK;
      ctx.fillRect(0, 0, W, H);

      if (!to && w.endAt !== null && t >= WARP_SWITCH_MS) {
        to = snapshot(W, H, canvas);
        arrivedAt = now;
      }

      if (!to) {
        // Leaving: into pixels, then back from the globe; held there (still easing away a touch) until the next page is in.
        const pull = t < PIXEL_MS ? 0 : Math.min(1, (t - PIXEL_MS) / PULL_MS);
        const wait = Math.max(0, t - WARP_SWITCH_MS);
        heldScale = 1 - (1 - BACK) * (1 - (1 - pull) ** 3) - 0.03 * Math.min(1, wait / 900);
        draw(from, heldScale, 1 + (GRAIN - 1) * Math.min(1, t / WARP_SWITCH_MS), 1 - 0.3 * Math.min(1, wait / 500));
        canvas.style.opacity = String(Math.min(1, t / PIXEL_MS));
      } else {
        const u = now - arrivedAt;
        const cross = Math.min(1, u / CROSS_MS);
        const zoom = Math.min(1, Math.max(0, (u - CROSS_MS) / ZOOM_MS));
        const clear = Math.min(1, Math.max(0, (u - CROSS_MS - ZOOM_MS) / CLEAR_MS));
        if (clear >= 1) {
          clearWarp();
          return;
        }
        // Closing in: fast at first, settling as it comes sharp.
        const eased = 1 - (1 - zoom) ** 3;
        const scale = heldScale + (1 - heldScale) * eased;
        const grain = GRAIN - (GRAIN - 1) * eased;
        draw(from, scale, grain, 0.7 * (1 - cross));
        draw(to, scale, grain, cross);
        canvas.style.opacity = String(1 - clear);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  return createPortal(<canvas ref={ref} aria-hidden className="fixed inset-0 z-[9000] h-full w-full" style={{ imageRendering: 'pixelated' }} />, document.body);
}
