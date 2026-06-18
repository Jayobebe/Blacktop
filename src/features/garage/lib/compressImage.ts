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
 * Pixelate an uploaded image: downscale to a chunky low-res then snapshot at a
 * larger size so the result reads as crunchy "low-poly" pixels. Output is a PNG
 * data URL so transparency (if any) is preserved.
 */
export async function pixelateImageFile(
  file: File,
  opts: { targetWidth?: number; outputWidth?: number; saturate?: number; contrast?: number } = {},
): Promise<string> {
  const { targetWidth = 96, outputWidth = 512, saturate = 1.15, contrast = 1.1 } = opts;
  const img = await loadFile(file);

  const aspect = img.height / img.width;
  const lowW = targetWidth;
  const lowH = Math.max(1, Math.round(targetWidth * aspect));

  // Step 1: downscale aggressively
  const low = document.createElement('canvas');
  low.width = lowW;
  low.height = lowH;
  const lowCtx = low.getContext('2d');
  if (!lowCtx) throw new Error('canvas');
  lowCtx.imageSmoothingEnabled = true;
  lowCtx.filter = `saturate(${saturate}) contrast(${contrast})`;
  lowCtx.drawImage(img, 0, 0, lowW, lowH);

  // Step 2: upscale with nearest-neighbour for crunchy pixels
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
