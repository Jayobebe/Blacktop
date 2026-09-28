/**
 * Motion for the app backdrop's wordmark belts (see components/AppBackdrop).
 * Module-level so anything can drive it without context:
 *
 *   - surgeBackdrop(): belts spin up, then coast back to cruising speed.
 *   - scrollBackdrop(): rows follow page scrolling vertically, through the lens.
 *   - setBackdropPull(): pull-to-refresh; belts slow, rows follow the finger,
 *     the fish-eye lens bulges. Everything springs back on release.
 *
 * One rAF loop runs only while something is moving; all writes go straight to
 * the DOM (belt playbackRate, row transforms, the lens filter's scale).
 */

/** Rows travel this fraction of the scroll distance (1 = glued to the page). */
const SCROLL_FOLLOW = 0.6;
/** Rows travel this fraction of the pull distance. */
const PULL_FOLLOW = 0.8;
/** Extra lens strength at a full pull (0.7 = 70% stronger bulge). */
const PULL_LENS_STRETCH = 0.7;
/** Belt speed at a full pull, as a multiple of cruising speed. */
const PULL_HOLD = 0.12;

const MAX_ENERGY = 40;
const ENERGY_HALF_LIFE_MS = 380;
const RATE_EASE = 0.12; // per-frame lerp towards the target rate (the spin-up feel)
const SPRING_EASE = 0.2; // pull shift / lens stretch returning to rest

interface Belts {
  root: HTMLElement;
  slots: HTMLElement[];
  rowHeight: number;
  viewportHeight: number;
}

let belts: Belts | null = null;
let lensEl: SVGFEDisplacementMapElement | null = null;
let lensBaseScale = 0;
let frozen = false;

let energy = 0;
let rate = 1;
let hold = 1; // target speed multiple from a pull
let scrollOffset = 0; // px the rows have travelled up, accumulated forever
let pullTarget = 0; // px the rows are pulled down right now
let pullShift = 0; // eased towards pullTarget
let stretchTarget = 0;
let stretch = 0;
let raf = 0;
let lastFrame = 0;
let layoutDirty = true;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const mod = (n: number, m: number) => ((n % m) + m) % m;

function beltAnimations(): Animation[] {
  if (!belts || typeof belts.root.getAnimations !== 'function') return [];
  return belts.root.getAnimations({ subtree: true });
}

/**
 * Stack the rows as an endless loop: each row sits at its slot in a pool a bit
 * taller than the screen, shifted by the scroll/pull offset and wrapped, so a
 * row leaving the top re-enters at the bottom off-screen (and vice versa).
 */
function layoutRows() {
  if (!belts) return;
  const { slots, rowHeight, viewportHeight } = belts;
  const pool = slots.length * rowHeight;
  const margin = (pool - viewportHeight) / 2;
  const offset = scrollOffset - pullShift;
  for (let i = 0; i < slots.length; i++) {
    const y = mod(i * rowHeight - offset, pool) - margin;
    slots[i].style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  }
}

function step(now: number) {
  const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
  lastFrame = now;
  const k = (ease: number) => 1 - Math.pow(1 - ease, dt / 16.7);

  // Speed: surge energy bleeds away, the pull holds the belts back.
  energy *= Math.pow(0.5, dt / ENERGY_HALF_LIFE_MS);
  const targetRate = (1 + energy) * hold;
  rate += (targetRate - rate) * k(RATE_EASE);

  // Pull shift and lens stretch spring towards their targets.
  const prevShift = pullShift;
  pullShift += (pullTarget - pullShift) * k(SPRING_EASE);
  stretch += (stretchTarget - stretch) * k(SPRING_EASE);

  const settled =
    energy < 0.01 &&
    Math.abs(rate - targetRate) < 0.01 &&
    Math.abs(pullShift - pullTarget) < 0.1 &&
    Math.abs(stretch - stretchTarget) < 0.002;
  if (settled) {
    rate = targetRate;
    pullShift = pullTarget;
    stretch = stretchTarget;
  }

  for (const a of beltAnimations()) a.playbackRate = rate;
  if (layoutDirty || pullShift !== prevShift) layoutRows();
  layoutDirty = false;
  if (lensEl && lensBaseScale) lensEl.setAttribute('scale', String(lensBaseScale * (1 + stretch)));

  if (settled) {
    raf = 0;
    lastFrame = 0;
    return;
  }
  raf = requestAnimationFrame(step);
}

function wake() {
  if (!raf) raf = requestAnimationFrame(step);
}

/**
 * Kick the belts: they accelerate, then glide back to cruising speed.
 * `strength` is roughly the extra speed multiple at the peak (a tap ≈ 4, a page
 * change ≈ 30). No-op while frozen or with reduced motion.
 */
export function surgeBackdrop(strength = 4) {
  if (!belts || frozen || reducedMotion()) return;
  energy = Math.min(MAX_ENERGY, energy + strength);
  wake();
}

/** Page scrolled by `deltaY` px (positive = down); the rows follow at SCROLL_FOLLOW. */
export function scrollBackdrop(deltaY: number) {
  if (!belts || frozen || reducedMotion() || !deltaY) return;
  scrollOffset += deltaY * SCROLL_FOLLOW;
  layoutDirty = true;
  wake();
}

/**
 * Pull-to-refresh feedback. `progress` 0–1 of the way to the refresh threshold,
 * `distance` the (rubber-banded) pull in px. Pass 0, 0 on release to spring back.
 */
export function setBackdropPull(progress: number, distance: number) {
  if (!belts || frozen || reducedMotion()) return;
  const p = Math.max(0, Math.min(1, progress));
  hold = 1 - (1 - PULL_HOLD) * p;
  pullTarget = distance * PULL_FOLLOW;
  stretchTarget = PULL_LENS_STRETCH * p;
  wake();
}

/** Called by AppBackdrop whenever the rows are (re)rendered or the screen resizes. */
export function registerBackdropBelts(next: Belts | null) {
  belts = next;
  layoutDirty = true;
  if (next) layoutRows();
}

/** Called by AppBackdrop with the lens filter node and its resting scale. */
export function registerBackdropLens(el: SVGFEDisplacementMapElement | null, baseScale: number) {
  lensEl = el;
  lensBaseScale = baseScale;
  if (el) el.setAttribute('scale', String(baseScale * (1 + stretch)));
}

/** Freeze (active ride, open map): drop any surge/pull and snap back to rest. */
export function setBackdropFrozen(next: boolean) {
  frozen = next;
  if (!next) return;
  energy = 0;
  rate = 1;
  hold = 1;
  pullTarget = pullShift = 0;
  stretchTarget = stretch = 0;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrame = 0;
  for (const a of beltAnimations()) a.playbackRate = 1;
  layoutRows();
  if (lensEl && lensBaseScale) lensEl.setAttribute('scale', String(lensBaseScale));
}
