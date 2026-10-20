import { pixelArt } from '@/lib/pixelArt';

/** Compress an image file to a JPEG data URL, max 1024px on longest side. */
export async function compressImageFile(file: File, maxDim = 1024, quality = 0.8): Promise<string> {
  const img = await loadBitmap(file);
  const { w, h } = fitWithin(img.width, img.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

/** A picture given as a vehicle's cut-out has no transparent background at all. */
export class NotACutout extends Error {}

/**
 * A rider's own ready-made vehicle picture (a cut-out, usually pixel art
 * already), made ready for the garage: decoded small, its empty margin
 * trimmed, kept under `outputWidth` across, and nothing else. The picture
 * itself isn't touched.
 *
 * It used to have its background "cleared" first, by making every pixel
 * close to any corner's colour transparent, wherever it was in the picture.
 * A cut-out has no background to clear, so all that could do was harm: one
 * corner pixel that wasn't fully transparent and every part of the vehicle
 * near that colour (glass, a dark spoiler, a roll cage) was punched out.
 */
export async function prepareCutoutFile(file: File, opts: { workWidth?: number; outputWidth?: number } = {}): Promise<string> {
  const { workWidth = 520, outputWidth = 420 } = opts;
  const img = await loadBitmap(file, workWidth);
  const { w, h } = fitWithin(img.width, img.height, workWidth);
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  await tick();

  // A cut-out is see-through round the vehicle: a picture that's solid edge to edge is a photo with its background on.
  const alpha = ctx.getImageData(0, 0, w, h).data;
  let clear = 0;
  for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 32) clear++;
  if (clear < w * h * 0.02) {
    releaseCanvas(work);
    throw new NotACutout('no transparent background');
  }

  const cropped = cropTransparentBounds(work, 4);
  if (cropped !== work) releaseCanvas(work);
  const { w: ow, h: oh } = fitWithin(cropped.width, cropped.height, outputWidth);
  const out = document.createElement('canvas');
  out.width = ow;
  out.height = oh;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('canvas');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(cropped, 0, 0, ow, oh);

  const dataUrl = await canvasToPngDataUrl(out);
  releaseCanvas(cropped);
  releaseCanvas(out);
  return dataUrl;
}

/** The photo has nothing in it that stands out as a vehicle (or is nothing but one). */
export class NoVehicleFound extends Error {}

/**
 * A photo of the rider's vehicle, made into garage artwork on the phone: the
 * vehicle found as one shape (`vehicleMask`), everything else cleared, then
 * redrawn as pixel art in the SwitchBack look (`pixelArt`: about 120 pixels
 * across, a short palette, a dark line round it). At that size the vehicle
 * is plain to see and a number plate, sponsor lettering or a sticker is a
 * few flat pixels nobody can read. The photo itself goes nowhere.
 */
export async function cutOutPhotoFile(file: File): Promise<string> {
  const WORK = 640;
  const img = await loadBitmap(file, WORK);
  const { w, h } = fitWithin(img.width, img.height, WORK);
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  await tick();

  const { vehicleMask } = await import('./vehicleMask');
  const { mask, size } = await vehicleMask(work);

  // The model's square answer, stretched back over the photo.
  const small = document.createElement('canvas');
  small.width = size;
  small.height = size;
  const sc = small.getContext('2d');
  if (!sc) throw new Error('canvas');
  const grey = sc.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) {
    grey.data[i * 4] = grey.data[i * 4 + 1] = grey.data[i * 4 + 2] = mask[i];
    grey.data[i * 4 + 3] = 255;
  }
  sc.putImageData(grey, 0, 0);
  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bc = big.getContext('2d', { willReadFrequently: true });
  if (!bc) throw new Error('canvas');
  bc.drawImage(small, 0, 0, w, h);
  const shade = bc.getImageData(0, 0, w, h).data;
  releaseCanvas(small);
  releaseCanvas(big);

  // The vehicle is the biggest single shape: anything apart from it (a cone, a sign, someone walking past) goes.
  const n = w * h;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] || shade[start * 4] < 128) continue;
    next++;
    let top = 0;
    let count = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const p = stack[--top];
      count++;
      const x = p % w;
      const around = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of around) {
        if (q < 0 || q >= n || label[q] || shade[q * 4] < 128) continue;
        label[q] = next;
        stack[top++] = q;
      }
    }
    if (count > bestSize) {
      bestSize = count;
      best = next;
    }
  }
  if (bestSize < n * 0.03 || bestSize > n * 0.92) {
    releaseCanvas(work);
    throw new NoVehicleFound('no vehicle');
  }

  const photo = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < n; i++) photo.data[i * 4 + 3] = label[i] === best ? 255 : 0;
  ctx.putImageData(photo, 0, 0);
  await tick();

  const cropped = cropTransparentBounds(work, 4);
  if (cropped !== work) releaseCanvas(work);
  const cutout = await canvasToPngDataUrl(cropped);
  releaseCanvas(cropped);
  return (await pixelArt(cutout)) ?? cutout;
}

function fitWithin(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(1, width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

function cropTransparentBounds(source: HTMLCanvasElement, pad: number): HTMLCanvasElement {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;
  const { width: w, height: h } = source;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return source;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')?.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) return canvas.toDataURL('image/png');
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Memory-efficient image decode. createImageBitmap streams the file directly
 * without ever materialising a giant base64 string in memory, which is what
 * was crashing the page on large phone-camera photos.
 */
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
}

async function loadBitmap(file: File, maxDecodeDim?: number): Promise<
  (HTMLImageElement | ImageBitmap) & { close?: () => void }
> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(
        file,
        maxDecodeDim
          ? { resizeWidth: maxDecodeDim, resizeQuality: 'low', imageOrientation: 'from-image' }
          : { imageOrientation: 'from-image' },
      );
    } catch {
      // fall through to <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    return el;
  } finally {
    // Revoke after load is queued; image is already decoded into the element.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
