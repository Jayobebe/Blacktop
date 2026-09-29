/// <reference lib="webworker" />
/**
 * Runs the Piper voice off the main thread. Every file comes from the pilot
 * voice cache (downloaded from Settings), so it works offline and nothing is
 * fetched mid-ride. One worker per voice: to change voice, start a new one.
 *
 * Messages in:  { type: 'init', voiceId } | { type: 'speak', id, text }
 * Messages out: { type: 'ready' } | { type: 'error', id?, message } | { type: 'audio', id, wav }
 */
import { ENGINE_FILES, HF_BASE, ORT_BASE, PILOT_CACHE } from './voices';

declare const self: DedicatedWorkerGlobalScope;

// The library keeps its own copy of each voice in OPFS. The cache already
// has it, so keep OPFS out of it (no second 60 MB copy, and OPFS writes
// aren't reliable in every WebView).
try {
  (StorageManager.prototype as unknown as { getDirectory: () => Promise<never> }).getDirectory = () =>
    Promise.reject(new Error('pilot voice uses the cache'));
} catch {
  /* nothing to turn off */
}

async function cached(url: string): Promise<Response> {
  const cache = await caches.open(PILOT_CACHE);
  const hit = await cache.match(url);
  if (!hit) throw new Error(`pilot voice file missing: ${url}`);
  return hit;
}

// The library fetches the voice itself; answer from the cache.
const realFetch = self.fetch.bind(self);
self.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(HF_BASE)) return cached(url);
  return realFetch(input, init);
}) as typeof fetch;

async function blobUrl(url: string): Promise<string> {
  return URL.createObjectURL(await (await cached(url)).blob());
}

type Session = { predict: (text: string) => Promise<Blob> };
let session: Session | null = null;

async function init(voiceId: string) {
  // Silence the library's console.error for the OPFS copy it no longer makes.
  const error = console.error;
  console.error = () => {};
  try {
    const [ortSimd, phonemizeWasm, phonemizeData] = await Promise.all(ENGINE_FILES.map((f) => blobUrl(f.url)));
    const { TtsSession } = await import('@mintplex-labs/piper-tts-web');
    session = (await TtsSession.create({
      voiceId,
      wasmPaths: {
        // Only the SIMD build is kept; the others stay on the CDN (not used on current phones).
        onnxWasm: {
          'ort-wasm-simd.wasm': ortSimd,
          'ort-wasm.wasm': `${ORT_BASE}ort-wasm.wasm`,
          'ort-wasm-threaded.wasm': `${ORT_BASE}ort-wasm-threaded.wasm`,
          'ort-wasm-simd-threaded.wasm': `${ORT_BASE}ort-wasm-simd-threaded.wasm`,
        } as unknown as string,
        piperWasm: phonemizeWasm,
        piperData: phonemizeData,
      },
    })) as unknown as Session;
    // Warm up once so the first real call is quick.
    await session.predict('Check.');
    self.postMessage({ type: 'ready' });
  } catch (e) {
    self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    console.error = error;
  }
}

// One call at a time: the engine isn't re-entrant.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg?.type === 'init') {
    void init(msg.voiceId);
  } else if (msg?.type === 'speak') {
    queue = queue.then(async () => {
      try {
        if (!session) throw new Error('not ready');
        const wav = await (await session.predict(msg.text)).arrayBuffer();
        self.postMessage({ type: 'audio', id: msg.id, wav }, [wav]);
      } catch (e) {
        self.postMessage({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) });
      }
    });
  }
};
