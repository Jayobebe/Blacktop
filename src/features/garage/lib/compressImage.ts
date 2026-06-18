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
 * Pixelate an uploaded image with a chunky low-poly look, AND remove the
 * background by flood-filling from the edges. Output is a transparent PNG
 * data URL.
 */
export async function pixelateImageFile(
  file: File,
  opts: {
    targetWidth?: number;
    outputWidth?: number;
    saturate?: number;
    contrast?: number;
    bgTolerance?: number;
  } = {},
): Promise<string> {
  const {
    targetWidth = 160,
    outputWidth = 384,
    saturate = 1.15,
    contrast = 1.1,
    bgTolerance = 38,
  } = opts;
  const img = await loadFile(file);

  const aspect = img.height / img.width;
  const lowW = targetWidth;
  const lowH = Math.max(1, Math.round(targetWidth * aspect));

  // Step 1: downscale
  const low = document.createElement('canvas');
  low.width = lowW;
  low.height = lowH;
  const lowCtx = low.getContext('2d');
  if (!lowCtx) throw new Error('canvas');
  lowCtx.imageSmoothingEnabled = true;
  lowCtx.filter = `saturate(${saturate}) contrast(${contrast})`;
  lowCtx.drawImage(img, 0, 0, lowW, lowH);

  // Step 2: flood-fill background from edges (transparent)
  removeEdgeBackground(lowCtx, lowW, lowH, bgTolerance);

  // Step 3: upscale with nearest-neighbour for crunchy pixels
  const outW = outputWidth;
  const outH = Math.round(outputWidth * aspect);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('canvas');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(low, 0, 0, outW, outH);

  return out.toDataURL('image/png');
}

/** Flood-fill from all 4 edges, clearing any pixel within `tol` of the seed colors. */
function removeEdgeBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tol: number,
) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  // Seed from every edge pixel
  for (let x = 0; x < w; x++) {
    stack.push(x, 0);
    stack.push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    stack.push(0, y);
    stack.push(w - 1, y);
  }

  // Use first corner pixel as reference color (will compare to neighbour as we go)
  const tolSq = tol * tol * 3;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    const p = idx * 4;

    // Compare to neighbour-average or to corner — we treat any pixel reachable
    // from an edge whose colour is "light/uniform enough" relative to its
    // already-cleared neighbour as background. Simpler: compare to the closest
    // already-visited edge seed colour stored implicitly via reference.
    // For robustness we just compare to the four corner colours.
    if (!isCloseToCorner(data, w, h, p, tolSq)) {
      visited[idx] = 1;
      continue;
    }

    visited[idx] = 1;
    data[p + 3] = 0; // transparent

    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }

  ctx.putImageData(imgData, 0, 0);
}

function isCloseToCorner(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  p: number,
  tolSq: number,
): boolean {
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const r = data[p], g = data[p + 1], b = data[p + 2];
  for (const c of corners) {
    const dr = r - data[c];
    const dg = g - data[c + 1];
    const db = b - data[c + 2];
    if (dr * dr + dg * dg + db * db <= tolSq) return true;
  }
  return false;
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
