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
 * Pipeline: load → downscale to working resolution → remove background by
 * flood-fill from edges → downscale to pixel-art res → nearest-neighbour
 * upscale → transparent PNG data URL. Yields to the event loop between
 * heavy steps so the UI never locks up.
 */
export async function pixelateImageFile(
  file: File,
  opts: {
    workWidth?: number;   // bg removal works at this resolution
    pixelWidth?: number;  // chunkiness of pixel art
    outputWidth?: number; // final render width
    saturate?: number;
    contrast?: number;
    bgTolerance?: number;
  } = {},
): Promise<string> {
  const {
    workWidth = 512,
    pixelWidth = 150,
    outputWidth = 420,
    saturate = 1.15,
    contrast = 1.1,
    bgTolerance = 42,
  } = opts;

  const img = await loadFile(file);
  await tick();

  const aspect = img.height / Math.max(1, img.width);

  // === Step 1: downscale to working resolution ===
  const workW = Math.min(workWidth, img.width);
  const workH = Math.max(1, Math.round(workW * aspect));
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

  // === Step 3: downscale to chunky pixel-art size ===
  const pxW = Math.min(pixelWidth, workW);
  const pxH = Math.max(1, Math.round(pxW * aspect));
  const px = document.createElement('canvas');
  px.width = pxW;
  px.height = pxH;
  const pxCtx = px.getContext('2d');
  if (!pxCtx) throw new Error('canvas');
  pxCtx.imageSmoothingEnabled = true;
  pxCtx.drawImage(work, 0, 0, pxW, pxH);
  await tick();

  // === Step 4: nearest-neighbour upscale ===
  const outW = outputWidth;
  const outH = Math.max(1, Math.round(outW * aspect));
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('canvas');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(px, 0, 0, outW, outH);

  return out.toDataURL('image/png');
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
