import { useSyncExternalStore } from 'react';
import { setPendingTrackReceipt } from '@/lib/trackReceipt';
import { haptics } from '@/lib/haptics';
import { sceneCue } from '@/lib/radioFx';
import type { Lap, LatLng, PitMessage, PitStop, TelemetrySample, TrackDef, TrackSession } from '../types';
import { DEFAULT_PIT_LIMIT, PitTracker, onPitLane, type PitLive } from './pits';
import { LapTimer, liveDelta, type Fix } from './timing';
import { TrackLink, newLinkToken, type LinkMessage, type RacerPhase, type RacerSnapshot, type WalkShape } from './link';
import { saveSession, saveTrack } from './trackStore';
import { subscribeTrackGps } from './trackGps';
import { LaunchDetector, LoopCloser, MIN_LAP_TRAVEL_M, gateCentre, simplify } from './walker';
import { resampleLoop, smoothLoop } from './centerline';
import { speakPitBoard } from './pitCalls';
import { metres } from './geometry';
import { cleanPostRace, samePostRace, type PostRace } from './postRace';

import { tr } from '@/lib/i18n';
/**
 * Racer-side Track Pack. Phases:
 *   idle     — pairing QR up, choosing a track (crew can already join)
 *   walking  — recording a lap with GPS to create a track (then placing its lines)
 *   armed    — readied up: first heading to the grid (no launch detection, so
 *              riding out of the pits can't start the clock), then "I'm in
 *              position" and timing starts itself when a launch is detected
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
  /** Armed: the racer said they're on the grid, so a launch now starts timing. */
  inPosition: boolean;
  /** In the pit lane right now (tracks with pit lane timing), else null. */
  pitLane: PitLive | null;
  /** Pit lane visits this session. */
  pitStops: PitStop[];
  /** Pit lane speed limit, m/s: the rider's units' usual figure until the pit crew sets one. */
  pitLimit: number;
  /** What the pit crew wants after the session (lib/postRace), or null until they say. */
  postRace: PostRace | null;
}

/** The usual pit limit in the rider's units (60 km/h or 40 mph). */
function defaultPitLimit(): number {
  try {
    const s = JSON.parse(localStorage.getItem('blacktop-settings') || '{}') as { speedUnit?: string };
    return s.speedUnit === 'kph' ? DEFAULT_PIT_LIMIT.kph : DEFAULT_PIT_LIMIT.mph;
  } catch {
    return DEFAULT_PIT_LIMIT.mph;
  }
}

const INITIAL: RacerState = {
  inPosition: false,
  pitLane: null,
  pitStops: [],
  pitLimit: defaultPitLimit(),
  postRace: null,
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
/** Pit lane timing for the armed / running track (null without pit lane lines). */
let pits: PitTracker | null = null;
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
    inPosition: state.inPosition,
    pitLimit: state.pitLimit,
    pitStops: state.pitStops,
    pitTiming: !!(state.track?.pitIn && state.track?.pitOut),
    postRace: state.postRace,
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
  } else if (m.type === 'pitLimit') {
    // The pit crew set the pit lane limit (sanity: 10-150 km/h).
    const mps = Number(m.mps);
    if (!Number.isFinite(mps) || mps < 2.7 || mps > 42) return;
    set({ pitLimit: mps });
    if (pits) pits.limit = mps;
    broadcastState();
  } else if (m.type === 'postRace') {
    // Only before timing starts: the overlay recorder starts with the launch.
    const post = cleanPostRace(m.post);
    if (!post || state.phase === 'running' || samePostRace(post, state.postRace)) return;
    set({ postRace: post });
    haptics.light();
    broadcastState();
  } else if (m.type === 'track') {
    // The pit crew set the track (a pit-hosted link): save it and select it,
    // ready for the racer to go to the grid. Never mid-session.
    const track = cleanTrack(m.track);
    if (!track || state.phase !== 'idle' || state.track?.id === track.id) return;
    saveTrack({ ...track, lastUsedAt: Date.now() });
    set({ track });
    broadcastState();
    haptics.success();
    onTrackFromCrew?.(track);
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

/** Told when the pit crew sends a track (the racer screen shows a notice). */
let onTrackFromCrew: ((t: TrackDef) => void) | null = null;
export function setTrackFromCrewHandler(fn: ((t: TrackDef) => void) | null) {
  onTrackFromCrew = fn;
}

/**
 * The racer scanned a pit crew's QR: move this racer's link onto the crew's
 * channel (they then send the track they set up). Only between sessions.
 */
export function joinPitLink(token: string): boolean {
  if (state.phase !== 'idle' || !/^[a-f0-9]{32}$/.test(token)) return false;
  if (token === state.token) return true;
  link?.send({ type: 'ended' });
  link?.close();
  link = new TrackLink(token, onLinkMessage, (ok) => {
    set({ linked: ok });
    if (ok) broadcastState();
  });
  set({ token, crew: [] });
  return true;
}

/** A track from another phone, checked before it's saved (null when it isn't a usable track). */
function cleanTrack(t: unknown): TrackDef | null {
  const x = t as Partial<TrackDef> | null;
  const pt = (p: unknown) => {
    const q = p as LatLng | null;
    return q && Number.isFinite(q.lat) && Number.isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180 ? { lat: +q.lat, lng: +q.lng } : null;
  };
  const gate = (g: unknown) => {
    const a = pt((g as { a?: unknown } | null)?.a);
    const b = pt((g as { b?: unknown } | null)?.b);
    return a && b ? { a, b } : null;
  };
  if (!x || typeof x.id !== 'string' || !/^[\w-]{1,64}$/.test(x.id) || typeof x.name !== 'string') return null;
  const startFinish = gate(x.startFinish);
  const splits = Array.isArray(x.splits) ? x.splits.slice(0, 30).map(gate) : [];
  if (!startFinish || splits.some((g) => !g)) return null;
  const outline = Array.isArray(x.outline) ? x.outline.slice(0, 6000).map(pt) : undefined;
  if (outline?.some((p) => !p)) return null;
  return {
    id: x.id,
    name: x.name.trim().slice(0, 80) || 'Track',
    startFinish,
    splits: splits as TrackDef['splits'],
    createdAt: Number.isFinite(x.createdAt) ? Number(x.createdAt) : Date.now(),
    outline: outline as LatLng[] | undefined,
    source: x.source === 'library' || x.source === 'gps' || x.source === 'map' ? x.source : 'map',
    osmId: Number.isInteger(x.osmId) ? x.osmId : undefined,
    // Pit lane timing, when it's all there and well-formed.
    ...(() => {
      const pitIn = gate(x.pitIn);
      const pitOut = gate(x.pitOut);
      const lanes = Array.isArray(x.pitLane) ? x.pitLane.slice(0, 20).map((l) => (Array.isArray(l) ? l.slice(0, 2000).map(pt) : [])) : [];
      if (!pitIn || !pitOut || !lanes.length || lanes.some((l) => !l.length || l.some((p) => !p))) return {};
      const across = gate(x.startFinishPits);
      return { pitIn, pitOut, pitLane: lanes as LatLng[][], ...(across ? { startFinishPits: across } : {}) };
    })(),
  };
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
  // The pit lane stop / launch read the phone's motion many times a second.
  if (pits && state.phase === 'running') handlePitEvents(pits.feedG(Date.now(), g));
}

/** Pit lane events: the timer learns where the rider is, the screen and the crew the visit. */
function handlePitEvents(events: ReturnType<PitTracker['feedG']>) {
  if (!pits) return;
  for (const e of events) {
    if (e.type === 'pitIn') {
      timer?.setPit(true);
      haptics.medium();
    } else if (e.type === 'pitOut') {
      timer?.setPit(false);
      set({ pitStops: [...state.pitStops, e.stop] });
      haptics.success();
      broadcastState();
    } else if (e.type === 'stopped') {
      haptics.light();
    } else if (e.type === 'moving') {
      haptics.tick();
    }
  }
  const live = pits.live;
  if (live !== state.pitLane && (live || state.pitLane)) set({ pitLane: live });
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
  pits = track.pitIn && track.pitOut ? new PitTracker(track, state.pitLimit) : null;
  // No launch detection until the racer says they're in position (confirmInPosition).
  launch = null;
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
    pitLimit: state.pitLimit,
    postRace: state.postRace,
  });
  startGps();
  broadcastState();
}

/** The racer is on the grid: from now on a launch starts timing. */
export function confirmInPosition() {
  if (state.phase !== 'armed' || state.inPosition) return;
  launch = new LaunchDetector();
  set({ inPosition: true });
  haptics.medium();
  broadcastState();
}

export function disarm() {
  if (state.phase !== 'armed') return;
  timer = null;
  launch = null;
  onLaunch = null;
  stopGps();
  set({ phase: 'idle', inPosition: false });
  broadcastState();
}

/** Start now without waiting for a launch (e.g. rolling onto track mid-session). */
export function launchNow() {
  if (state.phase === 'armed') onLaunch?.(Date.now());
}

function beginRunning(track: TrackDef, t: number) {
  startedAt = t;
  // Launched from the pit box: the session starts in the pit lane.
  const last = recentFixes[recentFixes.length - 1];
  if (pits && last && onPitLane(track, last)) {
    pits.startInPit(t);
    timer?.setPit(true);
    set({ pitLane: pits.live });
  }
  // Launched on the line: lap 1 starts with the launch.
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
  // Pit lane first, so the timer knows before this fix whether the start/finish runs across the pits.
  if (pits) {
    const prevSample = timer.samples[timer.samples.length - 1];
    const v = fix.speed ?? (prevSample && fix.t > prevSample.t ? metres(prevSample, fix) / ((fix.t - prevSample.t) / 1000) : 0);
    handlePitEvents(pits.feedFix({ t: fix.t, lat: fix.lat, lng: fix.lng, v }));
  }
  const events = timer.feed({ ...fix, lean: sensorLean, g: sensorG });
  const patch: Partial<RacerState> = { ...common };

  for (const e of events) {
    // Timing sounds are alerts (like the pit calls): they sound whatever the App sounds switch says.
    if (e.type === 'lapStart') {
      patch.lapStartT = e.t;
      patch.splits = [];
      haptics.tick();
      sceneCue('beep');
    } else if (e.type === 'split') {
      patch.splits = [...(patch.splits ?? state.splits), { index: e.index, ms: e.ms, t: e.t }];
      link?.send({ type: 'split', index: e.index, ms: e.ms, t: e.t });
      sceneCue('beep');
    } else if (e.type === 'lap') {
      const bestBefore = state.bestLap;
      patch.laps = [...timer.laps];
      patch.bestLap = timer.bestLap();
      patch.bestSectors = timer.bestSectors();
      refreshBestSamples();
      link?.send({ type: 'lap', lap: e.lap });
      haptics.success();
      // A personal best gets the flourish.
      sceneCue(patch.bestLap && patch.bestLap.n === e.lap.n && patch.bestLap.n !== bestBefore?.n ? 'success' : 'beep');
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
      tele: {
        t: fix.t,
        now,
        lat: fix.lat,
        lng: fix.lng,
        v: last.v,
        lean: sensorLean,
        g: sensorG,
        lap: last.lap,
        d: last.d,
        lapStartT,
        delta,
        pit: state.pitLane ? { ...state.pitLane, limit: state.pitLimit } : null,
      },
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
  // Ended in the pit lane: that visit closes here.
  const lastStop = pits?.finish(Date.now());
  const pitStops = lastStop ? [...state.pitStops, lastStop] : state.pitStops;
  pits = null;

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
    pitStops: pitStops.length ? pitStops : undefined,
    pitLimit: state.track.pitIn ? state.pitLimit : undefined,
  };
  saveSession(session);
  setPendingTrackReceipt({
    sessionId: session.id,
    trackName: session.trackName,
    laps: session.laps.length,
    bestLapMs: timer.bestLap()?.ms ?? null,
    theoreticalMs: theoretical,
    pitStops: pitStops.filter((p) => !p.fromStart).length || undefined,
    fastestPitMs: pitStops.filter((p) => !p.fromStart && !p.unfinished).reduce<number | null>((b, p) => (b === null || p.laneMs < b ? p.laneMs : b), null),
  });
  timer = null;
  set({ phase: 'idle', pitLane: null, pitStops, laps: session.laps, bestLap: session.laps.filter((l) => l.valid).sort((a, b) => a.ms - b.ms)[0] ?? null });
  link?.send({ type: 'ended' });
  broadcastState();
  sendSessionToCrew(session);
  return session;
}

/**
 * The pit crew gets the whole session at the end (their results card and 3D
 * flyover): telemetry thinned to at most ~2,500 samples, as JSON in parts
 * small enough for a realtime message, sent a beat apart.
 */
function sendSessionToCrew(session: TrackSession) {
  const l = link;
  if (!l || !state.crew.length) return;
  // The crew turned the results off.
  if (state.postRace && !state.postRace.results) return;
  const step = Math.max(1, Math.ceil(session.samples.length / 2500));
  const compact = { ...session, samples: session.samples.filter((_, i) => i % step === 0) };
  const json = JSON.stringify(compact);
  const size = 48_000;
  const parts = Math.ceil(json.length / size);
  for (let i = 0; i < parts; i++) {
    setTimeout(() => l.send({ type: 'session', id: session.id, part: i, parts, data: json.slice(i * size, (i + 1) * size) }), 250 * i + 400);
  }
}
