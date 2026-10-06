import { useEffect, useRef, useState } from 'react';
import { FLAME, pixelLayer, pixelSpark, tongues } from '@/lib/pixelFlame';

type Origin = { x: number; y: number } | null;

/**
 * Burn overlay, in the spirit of DuckDuckGo's Fire Button ("Inferno"): a wall
 * of flames rises from the bottom, swallows the whole screen, then burns off
 * the top to reveal a clean app. Drawn on a canvas as pixel art (`lib/pixelFlame`,
 * the look a burnt-out Card Wars card shares): layered flat flames in whole
 * blocks (red tips, orange body, yellow core) with square sparks, so it's
 * cheap on phones.
 *
 * A real burn reloads the app while the screen is covered, so the animation is
 * split in two: `mode="burn"` rises to full cover, fires `onPeak`, and (with
 * `holdAtPeak`) keeps burning there while the wipe runs; after the reload
 * `<BurnReveal />` plays `mode="reveal"`, picking up fully covered and burning
 * off the top. `prefers-reduced-motion` gets a quick fade instead.
 */

const BURN_KEY = 'blacktop_burn_reveal';
/** Set just before the post-burn reload so the fresh app finishes the flames. */
export function markBurnReveal() {
  try {
    sessionStorage.setItem(BURN_KEY, '1');
  } catch {
    /* no reveal then: the app just appears */
  }
}

const RISE_MS = 1100; // bottom → fully covered
const CLEAR_MS = 1100; // fully covered → gone off the top

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export function BurnFlameOverlay({
  active,
  origin: _origin,
  onPeak,
  onComplete,
  holdAtPeak = false,
  mode = 'burn',
}: {
  active: boolean;
  /** Kept for the old API; the fire now rises from the whole bottom edge. */
  origin?: Origin;
  /** Fires when the screen is fully covered — safe to swap routes (or reload) underneath. */
  onPeak?: () => void;
  onComplete?: () => void;
  /** Keep burning at full cover after the peak (the page is about to reload). */
  holdAtPeak?: boolean;
  /** 'burn': rise and (unless holding) clear. 'reveal': start covered and clear. */
  mode?: 'burn' | 'reveal';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(active);
  const cb = useRef({ onPeak, onComplete });
  cb.current = { onPeak, onComplete };

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Timeline: p runs 0 → 0.5 (rising to full cover) → 1 (cleared off the top).
    const start = performance.now();
    const startP = mode === 'reveal' ? 0.5 : 0;
    let peaked = mode === 'reveal';
    let raf = 0;
    const sparks: Spark[] = [];
    const phase = Math.random() * 100;

    // One flame layer: tongues along its top edge, a ragged tail along its bottom edge, a block at a time.
    const layer = (top: number, bottom: number, t: number, amp: number, seed: number, fill: string) => {
      if (bottom <= top) return;
      // About 64 blocks across the screen.
      const px = Math.max(5, Math.round(W / 64));
      pixelLayer(ctx, -px, W + px, px, (x) => top - tongues(x, t, amp, seed), (x) => bottom + tongues(x, t * 0.8, amp * 0.55, seed + 11), fill);
    };

    const frame = (now: number) => {
      const elapsed = now - start;
      let p: number;
      if (reduce) {
        p = mode === 'reveal' ? 1 : 0.5;
      } else if (mode === 'reveal') {
        p = Math.min(1, startP + (elapsed / CLEAR_MS) * 0.5);
      } else if (elapsed < RISE_MS) {
        p = (elapsed / RISE_MS) * 0.5;
      } else if (holdAtPeak) {
        p = 0.5;
      } else {
        p = Math.min(1, 0.5 + ((elapsed - RISE_MS) / CLEAR_MS) * 0.5);
      }
      // Ease the band so it surges up, then slows as it covers.
      const e = p < 0.5 ? 0.5 * (1 - Math.pow(1 - p * 2, 2.2)) : 0.5 + 0.5 * Math.pow((p - 0.5) * 2, 1.6);
      const t = elapsed / 1000;

      // The band is the screen plus 400 px tall. Its head starts just below the
      // screen; at e = 0.5 the head is above the top and the tail below the
      // bottom (fully covered, on any screen height); at e = 1 the tail has
      // cleared the top.
      const band = H + 400;
      const head = e <= 0.5 ? H + 160 - (e / 0.5) * (H + 320) : -160 - ((e - 0.5) / 0.5) * (band + 60);
      const tail = head + band;

      ctx.clearRect(0, 0, W, H);
      // Heat ahead of the flames: two stepped bands, no soft gradient.
      layer(head - 210, head, t * 0.6, 50, phase + 40, 'rgba(249, 115, 22, 0.14)');
      layer(head - 120, head, t * 0.7, 40, phase + 45, 'rgba(249, 115, 22, 0.2)');

      layer(head - 40, tail + 40, t, 120, phase, FLAME.tips); // red tips / smouldering tail
      layer(head, tail - 30, t, 95, phase + 3, FLAME.body); // orange body
      layer(head + 55, tail - 110, t, 70, phase + 7, FLAME.core); // yellow core

      // Inside the fire: rows of flame tongues rising faster than the wall, so a
      // fully covered screen still reads as burning rather than a flat fill.
      const rowGap = Math.max(170, H * 0.3);
      const scroll = (t * 320) % rowGap;
      for (let k = -1; k < H / rowGap + 2; k++) {
        const rowTop = head + 170 + k * rowGap - scroll;
        const rowBottom = rowTop + rowGap * 0.55;
        if (rowTop < head + 120 || rowBottom > tail - 150) continue;
        layer(rowTop, rowBottom, t * 1.3, 60, phase + 20 + k * 3.1, k % 2 ? 'rgba(234, 88, 12, 0.42)' : 'rgba(254, 240, 138, 0.45)');
      }

      // Sparks off the flame front (and embers off the tail once it's passing).
      if (!reduce && sparks.length < 90) {
        for (let i = 0; i < 3; i++) {
          sparks.push({ x: Math.random() * W, y: head - Math.random() * 80, vx: (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 220, life: 1, size: 1 + Math.random() * 2.5 });
        }
        if (p > 0.5 && tail < H + 60) {
          sparks.push({ x: Math.random() * W, y: tail + 20, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 80, life: 0.8, size: 1 + Math.random() * 1.5 });
        }
      }
      const sparkPx = Math.max(4, Math.round(W / 96));
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx / 60;
        s.y += s.vy / 60;
        s.life -= 1 / 50;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        // Square, and flickering out rather than fading.
        if (s.life > 0.3 || Math.floor(t * 20 + i) % 2) pixelSpark(ctx, s.x, s.y, s.size > 2.2 ? sparkPx * 2 : sparkPx, s.life > 0.5 ? FLAME.spark : FLAME.body);
      }

      if (reduce) {
        canvas.style.opacity = mode === 'reveal' ? '0' : '1';
        canvas.style.transition = 'opacity 400ms ease';
      }

      if (!peaked && p >= 0.5) {
        peaked = true;
        cb.current.onPeak?.();
      }
      if (p >= 1 || (reduce && mode === 'reveal' && elapsed > 450)) {
        setVisible(false);
        cb.current.onComplete?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active, holdAtPeak, mode]);

  // Rendered as soon as `active` flips, so the canvas exists when the effect runs.
  if (!visible && !active) return null;
  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 z-[2000] pointer-events-auto" />;
}

/**
 * After a real burn the app reloads under full cover; this finishes the
 * flames on the fresh page. Mounted once in App.
 */
export function BurnReveal() {
  const [show] = useState(() => {
    try {
      const on = sessionStorage.getItem(BURN_KEY) === '1';
      if (on) sessionStorage.removeItem(BURN_KEY);
      return on;
    } catch {
      return false;
    }
  });
  const [done, setDone] = useState(false);
  if (!show || done) return null;
  return <BurnFlameOverlay active mode="reveal" onComplete={() => setDone(true)} />;
}
