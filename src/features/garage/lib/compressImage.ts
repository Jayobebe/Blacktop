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

/**
 * Single-pass background remover: any pixel whose colour is within `tol` of
 * one of the 4 corner colours becomes transparent. Fast, predictable, no
 * stack — won't freeze the main thread on phone-camera images.
 */
function removeEdgeBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tol: number,
) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const tolSq = tol * tol * 3;
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const cr = corners.map((c) => data[c]);
  const cg = corners.map((c) => data[c + 1]);
  const cb = corners.map((c) => data[c + 2]);

  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    for (let i = 0; i < 4; i++) {
      const dr = r - cr[i];
      const dg = g - cg[i];
      const db = b - cb[i];
      if (dr * dr + dg * dg + db * db <= tolSq) {
        data[p + 3] = 0;
        break;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
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
