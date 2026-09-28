import { useSyncExternalStore } from 'react';
import { setPendingTrackReceipt } from '@/lib/trackReceipt';
import { haptics } from '@/lib/haptics';
import type { Lap, LatLng, PitMessage, TelemetrySample, TrackDef, TrackSession } from '../types';
import { LapTimer, liveDelta, type Fix } from './timing';
import { TrackLink, newLinkToken, type LinkMessage, type RacerPhase, type RacerSnapshot, type WalkShape } from './link';
import { saveSession, saveTrack } from './trackStore';
import { subscribeTrackGps } from './trackGps';
import { LaunchDetector, LoopCloser, MIN_LAP_TRAVEL_M, gateCentre, simplify } from './walker';
import { resampleLoop, smoothLoop } from './centerline';
import { speakPitBoard } from './pitCalls';
import { metres } from './geometry';

import { tr } from '@/lib/i18n';
/**
 * Racer-side Track Pack. Phases:
 *   idle     — pairing QR up, choosing a track (crew can already join)
 *   walking  — recording a lap with GPS to create a track (then placing its lines)
 *   armed    — on the grid; timing starts itself when a launch is detected
 *   running  — lap timing, live to the pit crew
 */
export interface SplitMark {
  index: number;
  ms: number;
  t: number;
}

export interface RacerState {
  phase: RacerPhase;
  track: TrackDef | null;
  token: string | null;
  linked: boolean;
  crew: { id: string; name: string }[];
  walk: WalkShape | null;
  /** The recorded lap once it has closed, ready for placing the lines. */
  walkLoop: LatLng[] | null;
  /** Far enough round to finish the lap by hand. */
  canClose: boolean;
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
  gpsAccuracy: number | null;
  pit: PitMessage | null;
  riderName: string;
  launchedAt: number | null;
}

const INITIAL: RacerState = {
  phase: 'idle',
  track: null,
  token: null,
  linked: false,
  crew: [],
  walk: null,
  walkLoop: null,
  canClose: false,
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
  gpsAccuracy: null,
  pit: null,
  riderName: '',
  launchedAt: null,
};

let state: RacerState = INITIAL;
const listeners = new Set<() => void>();
let timer: LapTimer | null = null;
let link: TrackLink | null = null;
let unsubGps: (() => void) | null = null;
let launch: LaunchDetector | null = null;
let onLaunch: ((t: number) => void) | null = null;
let startedAt = 0;
let sensorLean = 0;
let sensorG = 0;
let bestLapSamples: TelemetrySample[] = [];
let bestLapStartT = 0;
let lastTeleSent = 0;
let lastWalkSent = 0;
const recentFixes: Fix[] = [];
let closer: LoopCloser | null = null;
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
    phase: state.phase,
    walk: state.walk ? { ...state.walk, trail: simplify(state.walk.trail, 4, 400) } : null,
    riderName: state.riderName,
    track: state.track,
    laps: state.laps,
    lapStartT: state.lapStartT,
    currentSplits: state.splits.map((s) => s.t),
    now: Date.now(),
    running: state.phase === 'running',
    pos: recentFixes.length ? { lat: recentFixes[recentFixes.length - 1].lat, lng: recentFixes[recentFixes.length - 1].lng } : null,
    gpsHz: state.gpsHz,
  };
}

function broadcastState() {
  link?.send({ type: 'state', snap: snapshot() });
}

function onLinkMessage(m: LinkMessage) {
  if (m.type === 'hello') {
    if (!state.crew.some((c) => c.id === m.crewId)) {
      set({ crew: [...state.crew, { id: m.crewId, name: String(m.name || tr("Pit crew")).slice(0, 30) }] });
      haptics.light();
    }
    broadcastState();
  } else if (m.type === 'pit' && m.msg?.from === 'crew') {
    set({ pit: { ...m.msg, text: String(m.msg.text).slice(0, 40), at: Date.now() } });
    speakPitBoard(m.msg.text);
    haptics.heavy();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* not supported */
    }
  }
}

// ── link / GPS plumbing ──────────────────────────────────────────────────────

/** Opens the pairing link as soon as the racer enters Track Pack. */
export function openRacerLink(riderName: string) {
  if (!link) {
    const token = newLinkToken();
    link = new TrackLink(token, onLinkMessage, (ok) => set({ linked: ok }));
    set({ token });
  }
  set({ riderName });
}

export function closeRacerLink() {
  if (state.phase === 'running' || state.phase === 'walking') return;
  link?.send({ type: 'ended' });
  link?.close();
  link = null;
  stopGps();
  set({ ...INITIAL });
}

export function getLinkToken() {
  return state.token;
}

function startGps() {
  if (!unsubGps) unsubGps = subscribeTrackGps(onFix);
}

function stopGps() {
  unsubGps?.();
  unsubGps = null;
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

// ── fixes ────────────────────────────────────────────────────────────────────

function onFix(fix: Fix) {
  if (state.lastFixT) {
    fixGaps.push(fix.t - state.lastFixT);
    if (fixGaps.length > 10) fixGaps.shift();
  }
  recentFixes.push(fix);
  if (recentFixes.length > 40) recentFixes.shift();
  const avgGap = fixGaps.length ? fixGaps.reduce((a, b) => a + b, 0) / fixGaps.length : 0;
  const common = {
    lastFixT: fix.t,
    gpsHz: avgGap > 0 ? Math.round((1000 / avgGap) * 10) / 10 : 0,
    gpsAccuracy: fix.accuracy,
    speed: fix.speed ?? state.speed,
  };

  if (state.phase === 'walking') return onWalkFix(fix, common);
  if (state.phase === 'armed') {
    set(common);
    // Let the crew see the rider rolling to the grid.
    if (Date.now() - lastWalkSent > 1000) {
      lastWalkSent = Date.now();
      broadcastState();
    }
    const t = launch?.feed(fix);
    if (t != null) onLaunch?.(t);
    // The launch fix itself also feeds the timer (it was just created).
    if (t != null) timer?.feed({ ...fix, lean: sensorLean, g: sensorG });
    return;
  }
  if (state.phase === 'running') return onRaceFix(fix, common);
  set(common);
}

// ── recording a new track (method 2) ────────────────────────────────────────
// GPS follows the rider until the lap closes on itself (or they finish it by
// hand); the smoothed lap then goes to the chase cam to place the lines.

/** Fixes worse than this don't go into the lap. */
const WALK_MAX_ACCURACY_M = 20;

export function startWalk(riderName: string) {
  openRacerLink(riderName);
  closer = new LoopCloser();
  set({
    phase: 'walking',
    track: null,
    walk: { trail: [], startFinish: null, splits: [], travelled: 0 },
    walkLoop: null,
    canClose: false,
  });
  startGps();
  broadcastState();
}

export function cancelWalk() {
  closer = null;
  set({ phase: 'idle', walk: null, walkLoop: null, canClose: false });
  stopGps();
  broadcastState();
}

function lapFrom(points: LatLng[]): LatLng[] {
  return smoothLoop(resampleLoop(points, 2), 3);
}

function closeLap(points: LatLng[]) {
  stopGps();
  closer = null;
  set({ walkLoop: lapFrom(points), walk: state.walk ? { ...state.walk, closed: true } : null, canClose: false });
  haptics.success();
  broadcastState();
}

/** Finish the lap by hand (the trail didn't quite meet itself). */
export function finishLapNow(): boolean {
  const lap = closer?.forceClose();
  if (!lap) return false;
  closeLap(lap);
  return true;
}

/** Throw the recorded lap away and ride it again. */
export function redoLap() {
  closer = new LoopCloser();
  set({ walk: { trail: [], startFinish: null, splits: [], travelled: 0 }, walkLoop: null, canClose: false });
  startGps();
  broadcastState();
}

function onWalkFix(fix: Fix, common: Partial<RacerState>) {
  const walk = state.walk;
  if (!walk || !closer || state.walkLoop) return;
  if (fix.accuracy != null && fix.accuracy > WALK_MAX_ACCURACY_M) {
    set(common);
    return;
  }
  const lap = closer.push(fix);
  if (lap) return closeLap(lap);
  const canClose = closer.travelled >= MIN_LAP_TRAVEL_M;
  set({ ...common, walk: { ...walk, trail: closer.pts.slice(), travelled: closer.travelled }, canClose });
  const now = Date.now();
  if (now - lastWalkSent > 1000) {
    lastWalkSent = now;
    broadcastState();
  }
}

/** The lines are placed and the track saved: back to the Track Pack home, on that track. */
export function finishWalk(track: TrackDef) {
  closer = null;
  stopGps();
  set({ phase: 'idle', walk: null, walkLoop: null, canClose: false, track });
  broadcastState();
}

// ── choosing a track ────────────────────────────────────────────────────────

/**
 * The racer picked a track: the pit crew gets it (lines, outline, name) right
 * away, before the racer readies up.
 */
export function selectTrack(track: TrackDef | null) {
  if (state.phase !== 'idle') return;
  set({ track });
  broadcastState();
}

// ── on the grid ─────────────────────────────────────────────────────────────

/**
 * Arms timing on a track: GPS runs, and the first real launch starts the
 * session (the caller starts the ride at that moment via `whenLaunched`).
 */
export function armTrack(track: TrackDef, riderName: string, whenLaunched: (t: number) => void) {
  openRacerLink(riderName);
  timer = new LapTimer(track);
  launch = new LaunchDetector();
  onLaunch = (t) => {
    onLaunch = null;
    launch = null;
    beginRunning(track, t);
    whenLaunched(t);
  };
  bestLapSamples = [];
  fixGaps.length = 0;
  set({
    ...INITIAL,
    phase: 'armed',
    track,
    riderName,
    token: state.token,
    linked: state.linked,
    crew: state.crew,
  });
  startGps();
  broadcastState();
}

export function disarm() {
  if (state.phase !== 'armed') return;
  timer = null;
  launch = null;
  onLaunch = null;
  stopGps();
  set({ phase: 'idle' });
  broadcastState();
}

/** Start now without waiting for a launch (e.g. rolling onto track mid-session). */
export function launchNow() {
  if (state.phase === 'armed') onLaunch?.(Date.now());
}

function beginRunning(track: TrackDef, t: number) {
  startedAt = t;
  // Launched on the line: lap 1 starts with the launch.
  const last = recentFixes[recentFixes.length - 1];
  if (last && metres(gateCentre(track.startFinish), last) < 8) timer?.standingStart(t);
  set({ phase: 'running', launchedAt: t, lapStartT: timer?.lapStartT ?? null });
  haptics.success();
  broadcastState();
}

// ── racing ──────────────────────────────────────────────────────────────────

function refreshBestSamples() {
  const best = timer?.bestLap();
  bestLapSamples = best && timer ? timer.samples.filter((s) => s.lap === best.n && s.t <= best.endT) : [];
  bestLapStartT = best?.startT ?? 0;
}

function onRaceFix(fix: Fix, common: Partial<RacerState>) {
  if (!timer) return;
  const events = timer.feed({ ...fix, lean: sensorLean, g: sensorG });
  const patch: Partial<RacerState> = { ...common };

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
  const elapsed = lapStartT !== null ? fix.t - lapStartT : null;
  const delta = elapsed !== null && last ? liveDelta(bestLapSamples, bestLapStartT, last.d, elapsed) : null;

  set({ ...patch, lapNumber: timer.currentLapNumber, speed: last?.v ?? 0, lean: sensorLean, g: sensorG, delta });

  const now = Date.now();
  if (link && last && now - lastTeleSent >= 200) {
    lastTeleSent = now;
    link.send({
      type: 'tele',
      tele: { t: fix.t, now, lat: fix.lat, lng: fix.lng, v: last.v, lean: sensorLean, g: sensorG, lap: last.lap, d: last.d, lapStartT, delta },
    });
  }
}

/**
 * Stops timing, saves the session and leaves a receipt for the ride that's
 * about to be ended by the caller. Returns the saved session.
 */
export function endSession(bikeId?: string): TrackSession | null {
  if (state.phase !== 'running' || !timer || !state.track) return null;
  stopGps();
  const flushed = timer.flush();
  if (flushed.some((e) => e.type === 'lap')) refreshBestSamples();

  const bestSectors = timer.bestSectors();
  const theoretical = bestSectors.length && bestSectors.every(Number.isFinite) ? bestSectors.reduce((a, b) => a + b, 0) : null;
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
  timer = null;
  set({ phase: 'idle', laps: session.laps, bestLap: session.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0] ?? null });
  link?.send({ type: 'ended' });
  broadcastState();
  return session;
}
