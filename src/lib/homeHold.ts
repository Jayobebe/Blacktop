/**
 * Home's moving things (the backdrop's belts, the globe, its band's lettering,
 * the tuner) brake to a halt together while a ride's receipt prints over Home,
 * and spin back up once it has flown into History: on a phone they and the
 * receipt fought for frames. Each reads `motionScale()` as a multiple of its
 * own speed every frame, and stops drawing once it's 0 while held, starting
 * again when `subscribeMotionHold` says the hold is off. Imports nothing.
 */

/** How long the brake takes to a dead stop, and the spin back up to full speed. */
const BRAKE_MS = 800;
const SPIN_MS = 1100;

let held = false;
let since = -1e9;
/** The speed when the last change began, so a change mid-brake carries on from where it was. */
let from = 1;
const listeners = new Set<() => void>();

/** 1 at full speed, 0 stopped: braking eases out to the stop, the spin-up eases in and out. */
export function motionScale(now = performance.now()): number {
  const t = Math.max(0, Math.min(1, (now - since) / (held ? BRAKE_MS : SPIN_MS)));
  if (held) return from * (1 - t) * (1 - t);
  return from + (1 - from) * t * t * (3 - 2 * t);
}

export function motionHeld(): boolean {
  return held;
}

export function setMotionHeld(next: boolean) {
  if (next === held) return;
  from = motionScale();
  held = next;
  since = performance.now();
  listeners.forEach((l) => l());
}

export function subscribeMotionHold(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
