import { useSyncExternalStore } from 'react';
import type { RadioPlayerState, RadioStation } from '../types';
import { resolveTrackFile } from '../lib/audioFiles';
import { getStation } from './useRadioStations';

const EMPTY: RadioPlayerState = {
  stationId: null,
  stationName: null,
  queue: [],
  index: 0,
  trackName: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  needsReselect: false,
};

let state: RadioPlayerState = EMPTY;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function setState(patch: Partial<RadioPlayerState>) {
  state = { ...state, ...patch };
  emit();
}

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.addEventListener('ended', () => { void next(); });
  audio.addEventListener('timeupdate', () => {
    setState({ position: audio!.currentTime || 0, duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 });
  });
  audio.addEventListener('play', () => { setState({ isPlaying: true }); syncMediaSession(); });
  audio.addEventListener('pause', () => { setState({ isPlaying: false }); syncMediaSession(); });
  audio.addEventListener('error', () => { void next(); });
  return audio;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function setupMediaSessionHandlers() {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    ms.setActionHandler('play', () => { void play(); });
    ms.setActionHandler('pause', () => pause());
    ms.setActionHandler('nexttrack', () => { void next(); });
    ms.setActionHandler('previoustrack', () => { void previous(); });
    ms.setActionHandler('stop', () => stop());
  } catch { /* unsupported actions */ }
}

function syncMediaSession() {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    ms.playbackState = state.isPlaying ? 'playing' : 'paused';
    if (state.trackName) {
      ms.metadata = new (window as any).MediaMetadata({
        title: state.trackName.replace(/\.[a-z0-9]+$/i, ''),
        artist: state.stationName || 'Blacktop Radio',
        album: 'Blacktop Radio',
        artwork: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    }
  } catch { /* MediaMetadata unavailable */ }
}

async function loadIndex(station: RadioStation, index: number, autoplay: boolean) {
  if (!station.tracks.length) return;
  const trackId = state.queue[index];
  const track = station.tracks.find((t) => t.id === trackId) || station.tracks[0];
  const file = await resolveTrackFile(track);
  if (!file) {
    setState({ needsReselect: true, isPlaying: false, trackName: track.name });
    return;
  }
  const el = getAudio();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  el.src = objectUrl;
  setState({ index, trackName: track.name, needsReselect: false, position: 0, duration: 0 });
  setupMediaSessionHandlers();
  if (autoplay) {
    try { await el.play(); } catch { setState({ isPlaying: false }); }
  }
  syncMediaSession();
}

/** Start a station: shuffles the track list and plays immediately. */
export async function playStation(station: RadioStation) {
  if (!station.tracks.length) {
    setState({ stationId: station.id, stationName: station.name, queue: [], trackName: null, needsReselect: false });
    return;
  }
  const queue = shuffle(station.tracks.map((t) => t.id));
  setState({ stationId: station.id, stationName: station.name, queue, index: 0 });
  await loadIndex(station, 0, true);
}

export async function play() {
  const station = getStation(state.stationId);
  if (!station) return;
  const el = getAudio();
  if (!el.src) { await loadIndex(station, state.index, true); return; }
  try { await el.play(); } catch { /* blocked until a gesture */ }
}

export function pause() {
  audio?.pause();
}

export async function toggle() {
  if (state.isPlaying) pause();
  else await play();
}

export async function next() {
  const station = getStation(state.stationId);
  if (!station || !state.queue.length) return;
  const idx = (state.index + 1) % state.queue.length;
  await loadIndex(station, idx, true);
}

export async function previous() {
  const station = getStation(state.stationId);
  if (!station || !state.queue.length) return;
  const el = getAudio();
  // Match a car radio: restart the track if we're past the first few seconds.
  if (el.currentTime > 3) { el.currentTime = 0; return; }
  const idx = (state.index - 1 + state.queue.length) % state.queue.length;
  await loadIndex(station, idx, true);
}

export function seek(seconds: number) {
  const el = getAudio();
  if (Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration, seconds));
}

export function stop() {
  audio?.pause();
  if (audio) audio.currentTime = 0;
  setState({ isPlaying: false });
}

/** Clears the deck entirely — used when a station is deleted or data is burned. */
export function resetRadio() {
  audio?.pause();
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  if (audio) audio.removeAttribute('src');
  state = { ...EMPTY };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() { return state; }

export function getPlayerState() { return state; }

export function useRadioPlayer() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
