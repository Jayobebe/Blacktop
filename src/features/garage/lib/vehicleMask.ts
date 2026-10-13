/**
 * Finds the vehicle in a photo: a small salient-object model (U²-Net's light
 * version, 4.7 MB, Apache-2.0) run on the phone, so the photo never leaves it.
 * The model is one of the app's own files (`public/models`); ONNX Runtime's
 * engine comes from the same place the pilot voice's does. Loaded only when a
 * rider gives the garage a photo with its background on.
 *
 * It answers what a flat-colour key never could: the vehicle as one shape, so
 * glass, a dark spoiler or a roll cage stay part of it whatever is behind.
 */
import { ORT_BASE } from '@/lib/pilotVoice/voices';

const MODEL_URL = '/models/u2netp.onnx';
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> };
let session: Promise<{ ort: typeof import('onnxruntime-web'); s: Session }> | null = null;

function load() {
  if (!session) {
    session = (async () => {
      const ort = await import('onnxruntime-web');
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      const res = await fetch(MODEL_URL);
      if (!res.ok) throw new Error('model');
      const s = (await ort.InferenceSession.create(await res.arrayBuffer(), { executionProviders: ['wasm'] })) as unknown as Session;
      return { ort, s };
    })();
    session.catch(() => { session = null; });
  }
  return session;
}

/**
 * How much of each pixel is vehicle (0 to 255), `SIZE` by `SIZE`, for the
 * picture on the canvas given (squashed to the model's square, as it was
 * trained).
 */
export async function vehicleMask(source: HTMLCanvasElement): Promise<{ mask: Uint8ClampedArray; size: number }> {
  const { ort, s } = await load();
  const small = document.createElement('canvas');
  small.width = SIZE;
  small.height = SIZE;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(source, 0, 0, SIZE, SIZE);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let top = 1;
  for (let i = 0; i < px.length; i += 4) top = Math.max(top, px[i], px[i + 1], px[i + 2]);
  const n = SIZE * SIZE;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) input[c * n + i] = (px[i * 4 + c] / top - MEAN[c]) / STD[c];
  }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const d = out[s.outputNames[0]].data;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (d[i] < lo) lo = d[i];
    if (d[i] > hi) hi = d[i];
  }
  const span = hi - lo || 1;
  const mask = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) mask[i] = ((d[i] - lo) / span) * 255;
  return { mask, size: SIZE };
}
