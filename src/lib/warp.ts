import { useSyncExternalStore } from 'react';

/**
 * The jump into Blacktop World: a warp that covers the screen while the page
 * behind it changes and World's globe loads, so the wait is the effect and not
 * a stutter. Home starts it from the globe; World ends it once it has drawn.
 * `WarpOverlay` (mounted once in App) does the drawing.
 */
export interface Warp {
  /** Where it opens from, in CSS px. */
  x: number;
  y: number;
  startedAt: number;
  /** Set when the destination is ready: the warp finishes its run and clears. */
  endAt: number | null;
}

let warp: Warp | null = null;
let failsafe = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startWarp(x: number, y: number) {
  warp = { x, y, startedAt: performance.now(), endAt: null };
  window.clearTimeout(failsafe);
  // Never left up if the destination doesn't answer.
  failsafe = window.setTimeout(endWarp, 4500);
  emit();
}

/** The destination has drawn. */
export function endWarp() {
  if (!warp || warp.endAt !== null) return;
  warp = { ...warp, endAt: performance.now() };
  emit();
}

/** The overlay has faded out. */
export function clearWarp() {
  window.clearTimeout(failsafe);
  if (!warp) return;
  warp = null;
  emit();
}

export function useWarp(): Warp | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => warp,
    () => warp,
  );
}
