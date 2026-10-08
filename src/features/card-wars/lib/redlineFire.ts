import { fireBox, newFire, paintCardFire } from './cardFire';

/** Frames in the loop and how many play a second, and the size of one in blocks (a block is one pixel of the strip; the card scales it up unsmoothed). */
export const FIRE_FRAMES = 24;
const FPS = 12;
const W = 34;
const H = 48;
/** How far up the card the burn line holds. */
const LINE = 0.74;

let made = false;
/** The same numbers every time, so the fire is the same fire on every card and every launch. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * The fire behind a Redline card: the very fire that burns a knocked-out card
 * in a battle (`lib/cardFire`: the lumpy burn line, char and embers under it,
 * the four layers of flame standing on it, sparks), held part-way up the card
 * and never going out. Played once here into a strip of frames, handed to the
 * stylesheet as `--cw-redline-fire`; the card steps through the strip in CSS,
 * so any number of Redline cards on screen cost one small image and no script.
 * Thermal mode and reduced motion stop the stepping like every other
 * animation, leaving a still fire.
 */
export function ensureRedlineFire() {
  if (made || typeof document === 'undefined') return;
  made = true;
  const canvas = document.createElement('canvas');
  canvas.width = W * FIRE_FRAMES;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const random = rng(7);
  const box = fireBox(0, W, 0, H, 1);
  const fire = newFire(box, random);
  const dt = 1 / FPS;
  const line = H * LINE;
  // Let the sparks get going before the first frame is kept, so the loop doesn't open on an empty sky.
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  for (let i = -18; i < FIRE_FRAMES; i++) {
    const t = (i + 18) * dt;
    sctx.fillStyle = '#0a0403';
    sctx.fillRect(0, 0, W, H);
    paintCardFire(sctx, box, fire, t, dt, line, 1, true, random);
    if (i >= 0) ctx.drawImage(scratch, i * W, 0);
  }
  document.documentElement.style.setProperty('--cw-redline-fire', `url(${canvas.toDataURL('image/png')})`);
}
