/**
 * A rider's vehicle photo redrawn in the look of the Card Wars artwork (the
 * same steps as `finish` / `style` in scripts/make-card-wars-art.py, kept in
 * step with it): the vehicle about 120 pixels on its longer side, a short
 * palette of its own colours, stray pixels tidied, near-white kept white and a
 * dark line round the outside. The picture's own frame is kept (it isn't
 * trimmed), so a photo placed on a card sits exactly where it did.
 *
 * Done on the phone, on a small canvas, once per picture a launch (results are
 * remembered by source). The photo itself is never changed.
 */
const ACROSS = 120;
const COLOURS = 20;
const STORE = 3;
const INK: [number, number, number] = [16, 18, 24];
const WHITE: [number, number, number] = [244, 244, 240];

const done = new Map<string, Promise<string | null>>();
const ready = new Map<string, string>();

/** The styled picture if it has been made this launch (so a card can draw it on its first frame). */
export const styledNow = (src: string): string | undefined => ready.get(src);

/** The styled picture as a data URL; null when the picture can't be read (then the photo is shown as it is). */
export function pixelArt(src: string): Promise<string | null> {
  let p = done.get(src);
  if (!p) {
    p = make(src)
      .then((out) => {
        if (out) ready.set(src, out);
        return out;
      })
      .catch(() => null);
    done.set(src, p);
  }
  return p;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/** Median cut: `n` colours that between them cover the pixels given (r, g, b triples). */
function palette(pixels: number[], n: number): number[][] {
  let boxes: number[][] = [Array.from({ length: pixels.length / 3 }, (_, i) => i * 3)];
  while (boxes.length < n) {
    // Split the box with the widest spread of any one channel, at its median.
    let pick = -1;
    let widest = 0;
    let channel = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const i of box) {
          const v = pixels[i + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        // A big box matters more than a small one with the same spread.
        const score = (hi - lo) * Math.sqrt(box.length);
        if (score > widest) {
          widest = score;
          pick = bi;
          channel = c;
        }
      }
    });
    if (pick < 0) break;
    const box = boxes[pick].sort((a, b) => pixels[a + channel] - pixels[b + channel]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, pick), box.slice(0, mid), box.slice(mid), ...boxes.slice(pick + 1)];
  }
  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const i of box) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
    }
    const k = Math.max(1, box.length);
    return [Math.round(r / k), Math.round(g / k), Math.round(b / k)];
  });
}

async function make(src: string): Promise<string | null> {
  const img = await load(src);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return null;

  // Where the vehicle is in the frame, read at a size that's quick to scan.
  const probe = document.createElement('canvas');
  const pk = Math.min(1, 320 / Math.max(iw, ih));
  probe.width = Math.max(1, Math.round(iw * pk));
  probe.height = Math.max(1, Math.round(ih * pk));
  const pc = probe.getContext('2d', { willReadFrequently: true });
  if (!pc) return null;
  pc.drawImage(img, 0, 0, probe.width, probe.height);
  const pd = pc.getImageData(0, 0, probe.width, probe.height).data;
  let x0 = probe.width;
  let y0 = probe.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (pd[(y * probe.width + x) * 4 + 3] > 110) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  // A photo with no cut-out background fills its frame: there's no vehicle to outline, so it's left alone.
  const filled = (x1 - x0 + 1) * (y1 - y0 + 1) > probe.width * probe.height * 0.97 && pd[3] > 110 && pd[(probe.width - 1) * 4 + 3] > 110;
  if (filled) return null;

  // The whole frame, at the size that makes the vehicle ACROSS pixels on its longer side.
  const scale = (ACROSS / Math.max(x1 - x0 + 1, y1 - y0 + 1)) * pk;
  const w = Math.max(1, Math.min(360, Math.round(iw * scale)));
  const h = Math.max(1, Math.min(360, Math.round(ih * scale)));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sc = small.getContext('2d', { willReadFrequently: true });
  if (!sc) return null;
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(img, 0, 0, w, h);
  const image = sc.getImageData(0, 0, w, h);
  const d = image.data;
  const solid = new Uint8Array(w * h);
  const own: number[] = [];
  const lumas: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] > 110) {
      solid[i] = 1;
      lumas.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    }
  }
  if (!lumas.length) return null;
  lumas.sort((a, b) => a - b);
  // A dark vehicle lives in a narrow band of tones: more of the palette, and no colour push.
  const dark = lumas[lumas.length >> 1] < 62;
  const white = new Uint8Array(w * h);
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (!solid[i]) continue;
    let r = d[i * 4];
    let g = d[i * 4 + 1];
    let b = d[i * 4 + 2];
    if (Math.min(r, g, b) >= 206 && Math.max(r, g, b) - Math.min(r, g, b) <= 34) white[i] = 1;
    if (!dark) {
      // A little more colour and contrast, as the artwork has.
      const grey = 0.299 * r + 0.587 * g + 0.114 * b;
      r = grey + (r - grey) * 1.18;
      g = grey + (g - grey) * 1.18;
      b = grey + (b - grey) * 1.18;
      r = (r - 128) * 1.08 + 128;
      g = (g - 128) * 1.08 + 128;
      b = (b - 128) * 1.08 + 128;
    }
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    own.push(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
  const pal = palette(own, dark ? 30 : COLOURS);
  const index = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (!solid[i]) continue;
    let best = 0;
    let near = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const dr = rgb[i * 3] - pal[p][0];
      const dg = rgb[i * 3 + 1] - pal[p][1];
      const db = rgb[i * 3 + 2] - pal[p][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < near) {
        near = dist;
        best = p;
      }
    }
    index[i] = best;
  }
  // Tidy: a pixel that matches at most one of its neighbours takes the commonest colour round it.
  const tidy = index.slice();
  const tally = new Uint8Array(pal.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      tally.fill(0);
      let count = 0;
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = i + dy * w + dx;
          if (!solid[j]) continue;
          count++;
          tally[index[j]]++;
          if (index[j] === index[i]) same++;
        }
      }
      if (count >= 5 && same <= 1) {
        let top = 0;
        for (let p = 1; p < pal.length; p++) if (tally[p] > tally[top]) top = p;
        tidy[i] = top;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!solid[i]) {
      d[i * 4 + 3] = 0;
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid[i - 1] || !solid[i + 1] || !solid[i - w] || !solid[i + w];
    const c = edge ? INK : white[i] ? WHITE : pal[tidy[i]];
    d[i * 4] = c[0];
    d[i * 4 + 1] = c[1];
    d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = 255;
  }
  sc.putImageData(image, 0, 0);
  const out = document.createElement('canvas');
  out.width = w * STORE;
  out.height = h * STORE;
  const oc = out.getContext('2d');
  if (!oc) return null;
  oc.imageSmoothingEnabled = false;
  oc.drawImage(small, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
