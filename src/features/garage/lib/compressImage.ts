/** Compress an image file to a JPEG data URL, max 1024px on longest side. */
export async function compressImageFile(file: File, maxDim = 1024, quality = 0.8): Promise<string> {
  const img = await loadFile(file);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Pipeline: load → downscale → remove edge-connected background → crop the
 * transparent bounds → pixelate → encode a small, compatible PNG data URL.
 * The final image is intentionally compact so local garage storage does not
 * save a broken/oversized data URL.
 */
export async function pixelateImageFile(
  file: File,
  opts: {
    workWidth?: number;   // bg removal works within this max dimension
    pixelWidth?: number;  // chunkiness of pixel art within this max dimension
    outputWidth?: number; // final render max dimension
    saturate?: number;
    contrast?: number;
    bgTolerance?: number;
  } = {},
): Promise<string> {
  const {
    workWidth = 448,
    pixelWidth = 128,
    outputWidth = 280,
    saturate = 1.15,
    contrast = 1.1,
    bgTolerance = 58,
  } = opts;

  const img = await loadFile(file);
  await tick();

  // === Step 1: downscale to working resolution ===
  const { w: workW, h: workH } = fitWithin(img.width, img.height, workWidth);
  const work = document.createElement('canvas');
  work.width = workW;
  work.height = workH;
  const workCtx = work.getContext('2d', { willReadFrequently: true });
  if (!workCtx) throw new Error('canvas');
  workCtx.imageSmoothingEnabled = true;
  workCtx.filter = `saturate(${saturate}) contrast(${contrast})`;
  workCtx.drawImage(img, 0, 0, workW, workH);
  workCtx.filter = 'none';
  await tick();

  // === Step 2: remove background via bounded edge flood-fill ===
  floodFillBackground(workCtx, workW, workH, bgTolerance);
  await tick();

  // === Step 2b: remove empty transparent padding before pixelating ===
  const cropped = cropTransparentBounds(work);
  await tick();

  // === Step 3: downscale to chunky pixel-art size ===
  const { w: pxW, h: pxH } = fitWithin(cropped.width, cropped.height, pixelWidth);
  const px = document.createElement('canvas');
  px.width = pxW;
  px.height = pxH;
  const pxCtx = px.getContext('2d');
  if (!pxCtx) throw new Error('canvas');
  pxCtx.imageSmoothingEnabled = true;
  pxCtx.drawImage(cropped, 0, 0, pxW, pxH);
  await tick();

  // === Step 4: nearest-neighbour upscale ===
  const { w: outW, h: outH } = fitWithin(cropped.width, cropped.height, outputWidth);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('canvas');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(px, 0, 0, outW, outH);

  return canvasToPngDataUrl(out);
}

function fitWithin(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(1, width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  let current = canvas;
  let blob: Blob | null = null;

  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) => current.toBlob(resolve, 'image/png'));
    if (!blob || blob.size <= 260_000 || Math.max(current.width, current.height) <= 160) break;
    current = resizeNearest(current, 0.82);
    await tick();
  }

  if (!blob) return current.toDataURL('image/png');
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

function resizeNearest(source: HTMLCanvasElement, scale: number) {
  const next = document.createElement('canvas');
  next.width = Math.max(1, Math.round(source.width * scale));
  next.height = Math.max(1, Math.round(source.height * scale));
  const ctx = next.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, next.width, next.height);
  return next;
}

function cropTransparentBounds(source: HTMLCanvasElement) {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');

  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return source;

  const pad = 8;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2);
  const cropped = document.createElement('canvas');
  cropped.width = sw;
  cropped.height = sh;
  const croppedCtx = cropped.getContext('2d');
  if (!croppedCtx) throw new Error('canvas');
  croppedCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropped;
}

/**
 * Bounded flood-fill from every edge pixel. Only pixels reachable from an
 * edge AND within `tol` of one of the 4 corner colours are cleared. Uses a
 * typed-array stack to stay fast and avoid OOM on phone-camera images.
 */
function floodFillBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tol: number,
) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const visited = new Uint8Array(w * h);
  const tolSq = tol * tol * 3;

  const cornerIdx = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const cr = cornerIdx.map((c) => data[c]);
  const cg = cornerIdx.map((c) => data[c + 1]);
  const cb = cornerIdx.map((c) => data[c + 2]);

  const matchesBg = (p: number) => {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    for (let i = 0; i < 4; i++) {
      const dr = r - cr[i];
      const dg = g - cg[i];
      const db = b - cb[i];
      if (dr * dr + dg * dg + db * db <= tolSq) return true;
    }
    return false;
  };

  // Stack of pixel indices (not coords)
  const stack = new Int32Array(w * h);
  let sp = 0;

  const push = (idx: number) => {
    if (idx < 0 || idx >= w * h) return;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (!matchesBg(idx * 4)) return;
    data[idx * 4 + 3] = 0;
    stack[sp++] = idx;
  };

  // Seed all edges
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + (w - 1));
  }

  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x + 1 < w) push(idx + 1);
    if (x > 0) push(idx - 1);
    if (y + 1 < h) push(idx + w);
    if (y > 0) push(idx - w);
  }

  ctx.putImageData(imgData, 0, 0);
}

/** Yield to the event loop so the UI can paint between heavy canvas steps. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function loadFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
}
