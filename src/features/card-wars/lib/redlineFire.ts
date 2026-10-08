import { FLAME, pixelLayer, tongues } from '@/lib/pixelFlame';

/** Frames in the loop, and the size of one in blocks (a block is one pixel of the strip; the card scales it up unsmoothed). */
export const FIRE_FRAMES = 10;
const W = 36;
const H = 50;

let made = false;

/**
 * The fire behind a Redline card: the Burn button's own flames
 * (`lib/pixelFlame`: red tips, orange body, yellow core, a white-hot heart, all
 * in whole blocks) standing along the bottom of the card. Drawn once, as a
 * strip of frames, and handed to the stylesheet as `--cw-redline-fire`; the
 * card steps through the strip in CSS, so any number of Redline cards on
 * screen cost one small image and no script. Thermal mode and reduced motion
 * stop the stepping like every other animation, leaving a still fire.
 */
export function ensureRedlineFire() {
  if (made || typeof document === 'undefined') return;
  made = true;
  const canvas = document.createElement('canvas');
  canvas.width = W * FIRE_FRAMES;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = FLAME.char;
  ctx.fillRect(0, 0, canvas.width, H);
  for (let f = 0; f < FIRE_FRAMES; f++) {
    const t = f / FIRE_FRAMES;
    const x0 = f * W;
    // How high each layer stands: a floor, plus tongues that flicker.
    const layer = (floor: number, amp: number, seed: number, fill: string) =>
      pixelLayer(ctx, x0, x0 + W, 1, (x) => H - H * floor - tongues(x - x0, t, H * amp, seed, 22), () => H, fill);
    // The same proportions as a burning card's flames (CardBurn): tall red tongues, each layer inside the last.
    layer(0.1, 0.62, 0, FLAME.tips);
    layer(0.05, 0.46, 3, FLAME.body);
    layer(0.02, 0.3, 7, FLAME.core);
    layer(0, 0.14, 11, FLAME.heart);
  }
  document.documentElement.style.setProperty('--cw-redline-fire', `url(${canvas.toDataURL('image/png')})`);
}
