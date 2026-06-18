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

/**
 * Simple pipeline (mobile-safe):
 *   load → downscale → corner-colour background removal (single pass) →
 *   pixelate via nearest-neighbour down+up scale → small PNG data URL.
 *
 * Deliberately avoids flood-fill, large typed-array stacks, and multiple
 * full-frame ImageData copies that previously OOM'd phone cameras and
 * crashed the page right after "Pixelating…".
 */
export async function pixelateImageFile(
  file: File,
  opts: {
    workWidth?: number;
    pixelWidth?: number;
    outputWidth?: number;
    bgTolerance?: number;
  } = {},
): Promise<string> {
  const {
    workWidth = 220,
    pixelWidth = 64,
    outputWidth = 190,
    bgTolerance = 66,
  } = opts;

  const img = await loadBitmap(file, workWidth);

  // === 1. downscale to working res ===
  const { w: ww, h: wh } = fitWithin(img.width, img.height, workWidth);
  const work = document.createElement('canvas');
  work.width = ww;
  work.height = wh;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  if (!wctx) throw new Error('canvas');
  wctx.drawImage(img, 0, 0, ww, wh);
  img.close?.();
  await tick();

  // === 2. cut background based on corner colour similarity ===
  removeBackgroundByCorners(wctx, ww, wh, bgTolerance);
  await tick();

  // Tight crop the remaining transparent PNG so the bike/car fills the render.
  const cropped = cropTransparentBounds(work, 4);
  if (cropped !== work) releaseCanvas(work);
  await tick();

  // === 3. pixelate: downscale chunky then upscale nearest-neighbour ===
  const { w: pw, h: ph } = fitWithin(cropped.width, cropped.height, pixelWidth);
  const px = document.createElement('canvas');
  px.width = pw;
  px.height = ph;
  const pxctx = px.getContext('2d');
  if (!pxctx) throw new Error('canvas');
  pxctx.imageSmoothingEnabled = true;
  pxctx.drawImage(cropped, 0, 0, pw, ph);
  await tick();

  const { w: ow, h: oh } = fitWithin(cropped.width, cropped.height, outputWidth);
  const out = document.createElement('canvas');
  out.width = ow;
  out.height = oh;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(px, 0, 0, ow, oh);
  posterizeOpaquePixels(octx, ow, oh);

  const dataUrl = await canvasToPngDataUrl(out);
  releaseCanvas(cropped);
  releaseCanvas(px);
  releaseCanvas(out);
  return dataUrl;
}

/**
 * Mobile-safe upload cleanup for already-pixelated vehicle art:
 * decode small → remove flat corner-colour background → crop transparent bounds → PNG.
 */
export async function removeImageBackgroundFile(
  file: File,
  opts: { workWidth?: number; bgTolerance?: number; outputWidth?: number } = {},
): Promise<string> {
  const { workWidth = 520, bgTolerance = 58, outputWidth = 420 } = opts;
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

  removeBackgroundByCorners(ctx, w, h, bgTolerance);
  await tick();

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

function fitWithin(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(1, width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Single-pass background removal: any pixel within `tol` of any of the four
 * corner colours becomes transparent. No flood fill, no stack, O(w*h) once.
 */
function removeBackgroundByCorners(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tol: number,
) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const tolSq = tol * tol * 3;

  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ].filter((c) => data[c + 3] > 32);

  if (corners.length === 0) return;

  const cr = corners.map((c) => data[c]);
  const cg = corners.map((c) => data[c + 1]);
  const cb = corners.map((c) => data[c + 2]);

  const len = w * h;
  for (let i = 0; i < len; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    for (let k = 0; k < 4; k++) {
      const dr = r - cr[k];
      const dg = g - cg[k];
      const db = b - cb[k];
      if (dr * dr + dg * dg + db * db <= tolSq) {
        data[p + 3] = 0;
        break;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
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

function posterizeOpaquePixels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) {
      data[i + 3] = 0;
      continue;
    }
    data[i] = Math.round(data[i] / 32) * 32;
    data[i + 1] = Math.round(data[i + 1] / 32) * 32;
    data[i + 2] = Math.round(data[i + 2] / 32) * 32;
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
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
