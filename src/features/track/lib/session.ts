import { useSyncExternalStore } from 'react';
import { subscribeRawFixes, setGpsHighRate, type RawFix } from '@/features/ride';
import { setPendingTrackReceipt } from '@/lib/trackReceipt';
import { haptics } from '@/lib/haptics';
import type { Lap, PitMessage, TelemetrySample, TrackDef, TrackSession } from '../types';
import { LapTimer, liveDelta } from './timing';
import { TrackLink, newLinkToken, type LinkMessage, type RacerSnapshot } from './link';
import { saveSession } from './trackStore';

/**
 * Racer-side Track Pack session: runs the lap timer on raw GPS fixes, merges
 * in lean / G from the phone, and keeps the pit crew's phones in sync.
 */
export interface SplitMark {
  index: number;
  ms: number;
  t: number;
}

export interface RacerState {
  phase: 'idle' | 'running';
  track: TrackDef | null;
  token: string | null;
  linked: boolean;
  crew: { id: string; name: string }[];
  lapStartT: number | null;
  lapNumber: number;
  laps: Lap[];
  bestLap: Lap | null;
  bestSectors: number[];
  splits: SplitMark[];
  speed: number; // m/s
  lean: number;
  g: number;
  delta: number | null;
  lastFixT: number | null;
  gpsHz: number;
  pit: PitMessage | null;
  riderName: string;
}

const INITIAL: RacerState = {
  phase: 'idle',
  track: null,
  token: null,
  linked: false,
  crew: [],
  lapStartT: null,
  lapNumber: 0,
  laps: [],
  bestLap: null,
  bestSectors: [],
  splits: [],
  speed: 0,
  lean: 0,
  g: 0,
  delta: null,
  lastFixT: null,
  gpsHz: 0,
  pit: null,
  riderName: '',
};

let state: RacerState = INITIAL;
const listeners = new Set<() => void>();
let timer: LapTimer | null = null;
let link: TrackLink | null = null;
let unsubFixes: (() => void) | null = null;
let startedAt = 0;
let sensorLean = 0;
let sensorG = 0;
let bestLapSamples: TelemetrySample[] = [];
let bestLapStartT = 0;
let lastTeleSent = 0;
const fixGaps: number[] = [];

function set(patch: Partial<RacerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useRacer(): RacerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function getRacerState() {
  return state;
}

function snapshot(): RacerSnapshot {
  return {
    riderName: state.riderName,
    track: state.track!,
    laps: state.laps,
    lapStartT: state.lapStartT,
    currentSplits: state.splits.map((s) => s.t),
    now: Date.now(),
    running: state.phase === 'running',
  };
}

function onLinkMessage(m: LinkMessage) {
  if (m.type === 'hello') {
    if (!state.crew.some((c) => c.id === m.crewId)) {
      set({ crew: [...state.crew, { id: m.crewId, name: String(m.name || 'Pit crew').slice(0, 30) }] });
      haptics.light();
    }
    if (state.track) link?.send({ type: 'state', snap: snapshot() });
  } else if (m.type === 'pit' && m.msg?.from === 'crew') {
    const msg: PitMessage = { ...m.msg, text: String(m.msg.text).slice(0, 40), at: Date.now() };
    set({ pit: msg });
    haptics.heavy();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* not supported */
    }
  }
}

/** Opens the pairing link (and QR) for a track, before or during a session. */
export function openRacerLink(track: TrackDef, riderName: string) {
  if (!link) {
    const token = newLinkToken();
    link = new TrackLink(token, onLinkMessage, (ok) => set({ linked: ok }));
    set({ token });
  }
  set({ track, riderName });
}

export function closeRacerLink() {
  if (state.phase === 'running') return;
  link?.send({ type: 'ended' });
  link?.close();
  link = null;
  set({ token: null, linked: false, crew: [] });
}

export function updateSensors(lean: number, g: number) {
  sensorLean = lean;
  sensorG = g;
}

export function dismissPit() {
  set({ pit: null });
}

export function sendRiderCall(text: string) {
  link?.send({ type: 'pit', msg: { id: crypto.randomUUID(), text, at: Date.now(), from: 'rider' } });
  haptics.tick();
}

function refreshBestSamples() {
  const best = timer?.bestLap();
  bestLapSamples = best && timer ? timer.samples.filter((s) => s.lap === best.n && s.t <= best.endT) : [];
  bestLapStartT = best?.startT ?? 0;
}

function onFix(raw: RawFix) {
  if (!timer || state.phase !== 'running') return;
  if (state.lastFixT) {
    fixGaps.push(raw.t - state.lastFixT);
    if (fixGaps.length > 10) fixGaps.shift();
  }
  const events = timer.feed({ ...raw, lean: sensorLean, g: sensorG });
  const patch: Partial<RacerState> = {};

  for (const e of events) {
    if (e.type === 'lapStart') {
      patch.lapStartT = e.t;
      patch.splits = [];
      haptics.tick();
    } else if (e.type === 'split') {
      patch.splits = [...(patch.splits ?? state.splits), { index: e.index, ms: e.ms, t: e.t }];
      link?.send({ type: 'split', index: e.index, ms: e.ms, t: e.t });
    } else if (e.type === 'lap') {
      patch.laps = [...timer.laps];
      patch.bestLap = timer.bestLap();
      patch.bestSectors = timer.bestSectors();
      refreshBestSamples();
      link?.send({ type: 'lap', lap: e.lap });
      haptics.success();
    }
  }

  const last = timer.samples[timer.samples.length - 1];
  const lapStartT = patch.lapStartT ?? state.lapStartT;
  const elapsed = lapStartT !== null ? raw.t - lapStartT : null;
  const delta = elapsed !== null && last ? liveDelta(bestLapSamples, bestLapStartT, last.d, elapsed) : null;
  const avgGap = fixGaps.length ? fixGaps.reduce((a, b) => a + b, 0) / fixGaps.length : 0;

  set({
    ...patch,
    lapNumber: timer.currentLapNumber,
    speed: last?.v ?? 0,
    lean: sensorLean,
    g: sensorG,
    delta,
    lastFixT: raw.t,
    gpsHz: avgGap > 0 ? Math.round((1000 / avgGap) * 10) / 10 : 0,
  });

  const now = Date.now();
  if (link && last && now - lastTeleSent >= 200) {
    lastTeleSent = now;
    link.send({
      type: 'tele',
      tele: { t: raw.t, now, lat: raw.lat, lng: raw.lng, v: last.v, lean: sensorLean, g: sensorG, lap: last.lap, d: last.d, lapStartT, delta },
    });
  }
}

export function startSession(track: TrackDef, riderName: string) {
  if (state.phase === 'running') return;
  openRacerLink(track, riderName);
  timer = new LapTimer(track);
  startedAt = Date.now();
  bestLapSamples = [];
  fixGaps.length = 0;
  set({ ...INITIAL, phase: 'running', track, riderName, token: state.token, linked: state.linked, crew: state.crew });
  void setGpsHighRate(true);
  unsubFixes = subscribeRawFixes(onFix);
  link?.send({ type: 'state', snap: snapshot() });
}

/**
 * Stops timing, saves the session and leaves a receipt for the ride that's
 * about to be ended by the caller. Returns the saved session.
 */
export function endSession(bikeId?: string): TrackSession | null {
  if (state.phase !== 'running' || !timer || !state.track) return null;
  unsubFixes?.();
  unsubFixes = null;
  const flushed = timer.flush();
  if (flushed.some((e) => e.type === 'lap')) refreshBestSamples();
  void setGpsHighRate(false);

  const bestSectors = timer.bestSectors();
  const theoretical = bestSectors.every(Number.isFinite) ? bestSectors.reduce((a, b) => a + b, 0) : null;
  const session: TrackSession = {
    id: crypto.randomUUID(),
    trackId: state.track.id,
    trackName: state.track.name,
    startedAt,
    endedAt: Date.now(),
    laps: [...timer.laps],
    samples: [...timer.samples],
    splitsCount: state.track.splits.length,
    bikeId,
    riderName: state.riderName,
  };
  saveSession(session);
  setPendingTrackReceipt({
    sessionId: session.id,
    trackName: session.trackName,
    laps: session.laps.length,
    bestLapMs: timer.bestLap()?.ms ?? null,
    theoreticalMs: theoretical,
  });
  link?.send({ type: 'ended' });
  timer = null;
  set({ phase: 'idle', laps: session.laps, bestLap: session.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0] ?? null });
  return session;
}
