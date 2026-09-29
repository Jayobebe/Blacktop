/**
 * The pilot voice: a male neural voice (Piper) that runs on the phone and is
 * played through the radio chain (lib/radioFx), for the app's radio calls.
 * The phone's own speech can't be filtered, so this is what makes the calls
 * sound like a pilot on the radio rather than a clean voice over static.
 *
 * Opt-in: the voice and engine (~50-90 MB depending on language) are
 * downloaded from Settings into the Cache API, never over mobile data unasked.
 * Speech is made in a Web Worker (./worker.ts), started when a ride or
 * guidance begins or on the first call, and stopped after 10 idle minutes.
 * Phrases are cached, so repeated calls ("Turn left") cost nothing.
 *
 * Anything that goes wrong (not downloaded, language without a voice, too
 * slow, engine error) returns false and speech.ts uses the system voice.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getLanguage } from '@/lib/i18n';
import { decodeRadio, playRadioVoice } from '@/lib/radioFx';
import { PILOT_CACHE, PILOT_VOICES, allFiles, totalBytes, type PilotVoiceDef } from './voices';

export type PilotVoiceStatus = 'unsupported' | 'unavailable' | 'none' | 'downloading' | 'installed';

interface State {
  status: PilotVoiceStatus;
  /** 0..1 while downloading. */
  progress: number;
  /** Download size for this language's voice, in bytes. */
  bytes: number;
  error: string | null;
}

let state: State = { status: 'none', progress: 0, bytes: 0, error: null };
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function supported(): boolean {
  return typeof Worker !== 'undefined' && typeof caches !== 'undefined' && typeof WebAssembly !== 'undefined';
}

function currentVoice(): PilotVoiceDef | null {
  return PILOT_VOICES[getLanguage()] ?? null;
}

let checkedFor: string | null = null;

/** Re-check what's downloaded for the app's current language. */
export async function refreshPilotVoice(): Promise<void> {
  if (!supported()) return set({ status: 'unsupported' });
  const v = currentVoice();
  checkedFor = getLanguage();
  if (!v) return set({ status: 'unavailable', bytes: 0 });
  if (state.status === 'downloading') return;
  try {
    const cache = await caches.open(PILOT_CACHE);
    const have = await Promise.all(allFiles(v).map((f) => cache.match(f.url).then(Boolean)));
    set({ status: have.every(Boolean) ? 'installed' : 'none', bytes: totalBytes(v), error: null });
  } catch {
    set({ status: 'none', bytes: totalBytes(v) });
  }
}

function ensureChecked() {
  if (checkedFor !== getLanguage()) {
    checkedFor = getLanguage();
    stopWorker();
    phrases.clear();
    void Promise.resolve().then(refreshPilotVoice);
  }
}

export function usePilotVoice(): State {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(ensureChecked, []);
  return s;
}

let abort: AbortController | null = null;

/** Download this language's voice and the engine. Files already there are kept. */
export async function downloadPilotVoice(): Promise<void> {
  const v = currentVoice();
  if (!v || !supported() || state.status === 'downloading') return;
  abort = new AbortController();
  const files = allFiles(v);
  const total = totalBytes(v);
  set({ status: 'downloading', progress: 0, error: null });
  try {
    const cache = await caches.open(PILOT_CACHE);
    let done = 0;
    for (const f of files) {
      if (await cache.match(f.url)) {
        done += f.bytes;
        set({ progress: done / total });
        continue;
      }
      const res = await fetch(f.url, { signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        chunks.push(value);
        got += value.length;
        set({ progress: Math.min(0.999, (done + Math.min(got, f.bytes)) / total) });
      }
      const type = res.headers.get('Content-Type') ?? 'application/octet-stream';
      await cache.put(f.url, new Response(new Blob(chunks as BlobPart[], { type }), { headers: { 'Content-Type': type } }));
      done += f.bytes;
    }
    // Voices for other languages aren't needed any more.
    const keep = new Set(files.map((f) => f.url));
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    set({ status: 'installed', progress: 1 });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    set({ status: 'none', progress: 0, error: aborted ? null : 'failed' });
  } finally {
    abort = null;
  }
}

export function cancelPilotVoiceDownload() {
  abort?.abort();
}

/** Delete the voice and engine from the phone. */
export async function removePilotVoice(): Promise<void> {
  stopWorker();
  phrases.clear();
  try {
    await caches.delete(PILOT_CACHE);
  } catch {
    /* already gone */
  }
  await refreshPilotVoice();
}

// ---- The worker -------------------------------------------------------------

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, (wav: ArrayBuffer | null) => void>();
const IDLE_STOP_MS = 10 * 60 * 1000;

function stopWorker() {
  worker?.terminate();
  worker = null;
  ready = null;
  pending.forEach((cb) => cb(null));
  pending.clear();
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopWorker, IDLE_STOP_MS);
}

function startWorker(): Promise<boolean> {
  if (ready) return ready;
  const v = currentVoice();
  if (!v || state.status !== 'installed') return Promise.resolve(false);
  touch();
  ready = new Promise<boolean>((resolve) => {
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      worker = w;
      w.onmessage = (ev) => {
        const msg = ev.data;
        if (msg.type === 'ready') resolve(true);
        else if (msg.type === 'audio') {
          pending.get(msg.id)?.(msg.wav);
          pending.delete(msg.id);
        } else if (msg.type === 'error') {
          if (msg.id) {
            pending.get(msg.id)?.(null);
            pending.delete(msg.id);
          } else {
            console.warn('[pilotVoice] engine failed to start', msg.message);
            resolve(false);
          }
        }
      };
      w.onerror = () => resolve(false);
      w.postMessage({ type: 'init', voiceId: v.id });
    } catch {
      resolve(false);
    }
  });
  void ready.then((ok) => {
    if (!ok) stopWorker();
  });
  return ready;
}

/** Start the engine ahead of the first call (ride or guidance starting). */
export function warmPilotVoice() {
  ensureChecked();
  if (state.status === 'installed') void startWorker();
}

// ---- Speaking ---------------------------------------------------------------

const phrases = new Map<string, AudioBuffer>();
const MAX_PHRASES = 60;

function remember(text: string, buf: AudioBuffer) {
  phrases.delete(text);
  phrases.set(text, buf);
  if (phrases.size > MAX_PHRASES) phrases.delete(phrases.keys().next().value as string);
}

function synth(text: string): Promise<AudioBuffer | null> {
  const hit = phrases.get(text);
  if (hit) {
    remember(text, hit);
    return Promise.resolve(hit);
  }
  return startWorker().then((ok) => {
    if (!ok || !worker) return null;
    touch();
    const id = nextId++;
    return new Promise<AudioBuffer | null>((resolve) => {
      pending.set(id, (wav) => {
        if (!wav) return resolve(null);
        void decodeRadio(wav).then((buf) => {
          if (buf) remember(text, buf);
          resolve(buf);
        });
      });
      worker!.postMessage({ type: 'speak', id, text });
    });
  });
}

/** How long a call may take to make before the system voice says it instead. */
const MAX_WAIT_MS = 3500;
/** The first call also starts the engine, which takes a few seconds. */
const FIRST_WAIT_MS = 9000;

let current: { stop: () => void } | null = null;
let chainEnd: Promise<void> = Promise.resolve();
/** Bumped by an interrupt: calls queued before it are dropped. */
let generation = 0;

export function pilotVoiceReady(): boolean {
  ensureChecked();
  return state.status === 'installed';
}

/**
 * Say `text` as a radio call in the pilot voice. Resolves true once it has
 * started (or is queued behind the call already on air), false if the caller
 * should use the system voice. `onStart` / `onEnd` bracket the call on air.
 */
export async function pilotSay(
  text: string,
  opts: { interrupt?: boolean; onStart?: () => void; onEnd?: () => void } = {},
): Promise<boolean> {
  if (!pilotVoiceReady()) return false;
  const cold = !ready;
  const buf = await Promise.race([
    synth(text),
    new Promise<null>((r) => setTimeout(() => r(null), cold ? FIRST_WAIT_MS : MAX_WAIT_MS)),
  ]);
  if (!buf) return false;
  if (opts.interrupt) {
    generation++;
    current?.stop();
    chainEnd = Promise.resolve();
  }
  const gen = generation;
  chainEnd = chainEnd.then(async () => {
    if (gen !== generation) return;
    opts.onStart?.();
    const tx = playRadioVoice(buf);
    current = tx;
    await tx.done;
    if (current === tx) current = null;
    opts.onEnd?.();
    // A breath between back-to-back calls, for the squelch tail.
    await new Promise((r) => setTimeout(r, 150));
  });
  return true;
}

export function stopPilotVoice() {
  generation++;
  current?.stop();
  current = null;
  chainEnd = Promise.resolve();
}

// Know what's downloaded before the first call.
if (typeof window !== 'undefined') setTimeout(ensureChecked, 0);
