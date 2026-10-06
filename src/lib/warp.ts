import { isThermal } from '@/lib/thermal';

/**
 * Blacktop's page change: the page turns to pixels and draws back from where
 * the rider tapped, the next page takes its place underneath, the old page's
 * pixels fade into the new page's, and those close back in, getting finer,
 * until the copy matches the real page and lets go of it.
 *
 * It's a small canvas scaled up without smoothing (pixel art), owned by this
 * module and drawn outside React, so it can cover the screen in the same
 * instant a page change starts and costs next to nothing while it runs. The
 * "copy" of a page isn't a screenshot: `snapshot` redraws what's on screen in
 * blocks, in one pass and with no library.
 *
 * Two speeds. Every page change is quick (`installWarpNavigation` starts one
 * whenever the address changes). Between Home and Blacktop World it takes its
 * time: Home's globe starts that one itself (`startWarp`) and changes the page
 * at `WARP_SWITCH_MS`, once Home is fully in pixels.
 *
 * The arriving page says when it has drawn (`endWarp`, from `RouteReady` in
 * App); a failsafe lets go regardless. Nothing runs in Thermal mode or for
 * riders who ask for less motion.
 */

/** One block is this many CSS px. */
const BLOCK = 5;
const DARK = '#050506';

interface Pace {
  /** The real page cross-fades into its pixel copy (0: the copy is there at once). */
  pixel: number;
  /** Drawing back. */
  pull: number;
  /** Old pixels into new. */
  cross: number;
  /** Closing in to sharp. */
  zoom: number;
  /** Letting go. */
  clear: number;
  /** How far back it pulls, and how coarse the pixels get (in blocks). */
  back: number;
  grain: number;
}
const SLOW: Pace = { pixel: 130, pull: 360, cross: 200, zoom: 380, clear: 150, back: 0.84, grain: 2.7 };
const QUICK: Pace = { pixel: 0, pull: 150, cross: 100, zoom: 190, clear: 90, back: 0.9, grain: 2.3 };

/** For a warp started by hand (Home's globe): when the page underneath can change without being seen. */
export const WARP_SWITCH_MS = SLOW.pixel + SLOW.pull;

interface Warp {
  x: number;
  y: number;
  pace: Pace;
  startedAt: number;
  /** When the arriving page said it had drawn. */
  endAt: number | null;
  from: HTMLCanvasElement;
  to: HTMLCanvasElement | null;
  arrivedAt: number;
  held: number;
}

let warp: Warp | null = null;
let canvas: HTMLCanvasElement | null = null;
let raf = 0;
let failsafe = 0;
const coarse = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export const warpActive = () => warp !== null;
const still = () => isThermal() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const seen = (color: string) => !!color && color !== 'transparent' && !/,\s*0(\.0+)?\)$/.test(color);

/**
 * The page as it stands, drawn small: every box's fill and outline, text as
 * bars in its own colour, icons as blocks, and pictures and 2D canvases (the
 * globes, stickers) copied across. Panels mostly off to one side (the next
 * card of a swipe deck) are left out.
 */
function snapshot(W: number, H: number): HTMLCanvasElement {
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
    if (r.width > 60 && Math.min(r.right, vw) - Math.max(r.left, 0) < r.width * 0.25) {
      node = past();
      continue;
    }
    const el = node;
    node = walk.nextNode() as HTMLElement | null;
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
    // Not skipped for being see-through: a page that's still fading its pieces in is drawn as it will be.
    if (cs.visibility === 'hidden') continue;
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

function ensureCanvas(): HTMLCanvasElement {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    // Above the page and its dialogs, below the alarm.
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9000;image-rendering:pixelated;pointer-events:none;display:none';
    document.body.appendChild(canvas);
  }
  return canvas;
}

function finish() {
  cancelAnimationFrame(raf);
  window.clearTimeout(failsafe);
  warp = null;
  if (canvas) canvas.style.display = 'none';
}

function frame(now: number) {
  const w = warp;
  const c = canvas;
  const ctx = c?.getContext('2d');
  if (!w || !c || !ctx || !coarse) return;
  const W = c.width;
  const H = c.height;
  const cx = w.x / BLOCK;
  const cy = w.y / BLOCK;
  const p = w.pace;
  const t = now - w.startedAt;
  const switchAt = p.pixel + p.pull;

  /** A page copy, about the tap, at this size, this coarse and this strong. */
  const draw = (page: HTMLCanvasElement, scale: number, grain: number, alpha: number) => {
    if (alpha <= 0) return;
    coarse.width = Math.max(8, Math.round(W / grain));
    coarse.height = Math.max(8, Math.round(H / grain));
    const cc = coarse.getContext('2d')!;
    cc.imageSmoothingEnabled = false;
    cc.drawImage(page, 0, 0, coarse.width, coarse.height);
    ctx.globalAlpha = alpha;
    ctx.drawImage(coarse, cx - cx * scale, cy - cy * scale, W * scale, H * scale);
    ctx.globalAlpha = 1;
  };

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, W, H);

  if (!w.to && w.endAt !== null && t >= switchAt) {
    w.to = snapshot(W, H);
    w.arrivedAt = now;
  }

  if (!w.to) {
    // Leaving: into pixels, then back from the tap; held there (still easing away a touch) until the next page is in.
    const pull = t < p.pixel ? 0 : Math.min(1, (t - p.pixel) / p.pull);
    const wait = Math.max(0, t - switchAt);
    w.held = 1 - (1 - p.back) * (1 - (1 - pull) ** 3) - 0.03 * Math.min(1, wait / 900);
    draw(w.from, w.held, 1 + (p.grain - 1) * Math.min(1, t / Math.max(1, switchAt)), 1 - 0.3 * Math.min(1, wait / 500));
    c.style.opacity = p.pixel ? String(Math.min(1, t / p.pixel)) : '1';
  } else {
    const u = now - w.arrivedAt;
    const cross = Math.min(1, u / p.cross);
    const zoom = Math.min(1, Math.max(0, (u - p.cross) / p.zoom));
    const clear = Math.min(1, Math.max(0, (u - p.cross - p.zoom) / p.clear));
    if (clear >= 1) {
      finish();
      return;
    }
    // Closing in: fast at first, settling as it comes sharp.
    const eased = 1 - (1 - zoom) ** 3;
    const scale = w.held + (1 - w.held) * eased;
    const grain = p.grain - (p.grain - 1) * eased;
    draw(w.from, scale, grain, 0.7 * (1 - cross));
    draw(w.to, scale, grain, cross);
    c.style.opacity = String(1 - clear);
  }
  raf = requestAnimationFrame(frame);
}

/**
 * Starts a page change from this point on the screen (CSS px). The page as it
 * is now is copied here and now, so call it before the page changes. `quick`
 * is the everyday pace; `instant` puts the pixels up at once, for when the
 * page changes in the same breath. Without either it's the unhurried
 * Home-and-World pace, with the real page fading into its pixels.
 */
export function startWarp(x: number, y: number, options: { quick?: boolean; instant?: boolean } = {}) {
  if (typeof document === 'undefined' || warp || still()) return false;
  const c = ensureCanvas();
  const W = Math.max(40, Math.ceil(window.innerWidth / BLOCK));
  const H = Math.max(40, Math.ceil(window.innerHeight / BLOCK));
  c.width = W;
  c.height = H;
  const base = options.quick ? QUICK : SLOW;
  const pace = options.instant ? { ...base, pixel: 0 } : base;
  const now = performance.now();
  warp = { x, y, pace, startedAt: now, endAt: null, from: snapshot(W, H), to: null, arrivedAt: 0, held: 1 };
  c.style.opacity = pace.pixel ? '0' : '1';
  c.style.display = 'block';
  // The first frame now, not a frame from now: the page may be gone by then.
  cancelAnimationFrame(raf);
  frame(now);
  window.clearTimeout(failsafe);
  // Never left up if the arriving page doesn't answer.
  failsafe = window.setTimeout(
    () => {
      endWarp();
      // And if frames aren't being drawn at all (the tab is hidden), don't sit on the screen.
      failsafe = window.setTimeout(finish, 1500);
    },
    options.quick ? 2500 : 4500,
  );
  return true;
}

/** The arriving page has drawn. */
export function endWarp() {
  if (warp && warp.endAt === null) warp.endAt = performance.now();
}

let installed = false;
/**
 * Every page change gets the quick warp, from where the rider last tapped
 * (the middle of the screen when it wasn't a tap: the phone's Back). It hooks
 * the browser's history, which the router writes to before it redraws, so the
 * old page is still there to copy. Redirects (replace) and changes that keep
 * the same page (a query, a hash, history state) are left alone, and so is a
 * change made while a warp is already running (Home's globe). Home and World
 * swap at the unhurried pace.
 */
export function installWarpNavigation() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  let tap = { x: window.innerWidth / 2, y: window.innerHeight / 2, at: 0 };
  window.addEventListener('pointerdown', (e) => (tap = { x: e.clientX, y: e.clientY, at: performance.now() }), { capture: true, passive: true });
  let here = window.location.pathname;
  const go = (to: string, tapped: boolean) => {
    const from = here;
    here = to;
    if (to === from || warp) return;
    const worldTrip = (from === '/world' && to === '/') || (from === '/' && to === '/world');
    const recent = tapped && performance.now() - tap.at < 1500;
    startWarp(recent ? tap.x : window.innerWidth / 2, recent ? tap.y : window.innerHeight / 2, { quick: !worldTrip, instant: true });
  };
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    try {
      if (url != null) go(new URL(String(url), window.location.href).pathname, true);
    } catch {
      // A page change is never held up by its animation.
    }
    return push(data, unused, url);
  };
  const replace = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    try {
      if (url != null) here = new URL(String(url), window.location.href).pathname;
    } catch {
      // As above.
    }
    return replace(data, unused, url);
  };
  // Registered before the router mounts, so this hears Back first, with the old page still up.
  window.addEventListener('popstate', () => go(window.location.pathname, false));
}
