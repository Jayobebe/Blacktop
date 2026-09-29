import { useSyncExternalStore } from 'react';
import type { ArcadeGame, ArcadeScores } from '../types';
import { useDemoMode, isDemoModeActive, DEMO_SCORES, DEMO_MODE_BESTS } from '@/lib/demoMode';
import { publishArcadeScore } from '../lib/publishArcadeScore';

const LS_KEYS: Record<ArcadeGame, string> = {
  'hit-heavy': 'blacktop_arcade_hit_heavy_hs',
  'petrol-head': 'blacktop_arcade_petrol_head_hs',
  'legacy-derez': 'blacktop_arcade_legacy_derez_wins',
};

const listeners = new Set<() => void>();

// Stable reference so useSyncExternalStore doesn't see a change on every render
let cachedSnapshot: ArcadeScores = { 'hit-heavy': 0, 'petrol-head': 0, 'legacy-derez': 0 };

function getSnapshot(): ArcadeScores {
  const hh = Number(localStorage.getItem(LS_KEYS['hit-heavy']) ?? 0);
  const ph = Number(localStorage.getItem(LS_KEYS['petrol-head']) ?? 0);
  const ld = Number(localStorage.getItem(LS_KEYS['legacy-derez']) ?? 0);
  if (hh !== cachedSnapshot['hit-heavy'] || ph !== cachedSnapshot['petrol-head'] || ld !== cachedSnapshot['legacy-derez']) {
    cachedSnapshot = { 'hit-heavy': hh, 'petrol-head': ph, 'legacy-derez': ld };
  }
  return cachedSnapshot;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Save a score; returns true if it's a new personal best. Demo mode compares with the demo bests and keeps nothing. */
export function saveScore(game: ArcadeGame, score: number): boolean {
  if (isDemoModeActive()) return score > DEMO_SCORES[game];
  const current = Number(localStorage.getItem(LS_KEYS[game]) ?? 0);
  if (score > current) {
    localStorage.setItem(LS_KEYS[game], String(score));
    listeners.forEach(cb => cb());
    // Push straight to the crew board so mates see it without opening it first.
    if (game === 'hit-heavy') void publishArcadeScore('hit_heavy', score);
    if (game === 'petrol-head') void publishArcadeScore('petrol_head', Math.round(score));
    return true;
  }
  return false;
}

export function useArcadeScores() {
  const realScores = useSyncExternalStore(subscribe, getSnapshot);
  const { enabled: demoEnabled } = useDemoMode();
  return { scores: demoEnabled ? DEMO_SCORES : realScores };
}

/** Increment a counter-style arcade score (Derez Legacy wins). Returns the new total. */
export function bumpScore(game: ArcadeGame, by = 1): number {
  const next = Number(localStorage.getItem(LS_KEYS[game]) ?? 0) + by;
  localStorage.setItem(LS_KEYS[game], String(next));
  listeners.forEach(cb => cb());
  return next;
}

/**
 * Personal bests for the extra modes (Hit Heavy's Flurry and Precision, Petrol
 * Head's most near misses). Kept on this device only; the crew board ranks the
 * headline scores above.
 */
export type ArcadeModeBest = 'hit-heavy-flurry' | 'hit-heavy-precision' | 'petrol-head-misses';

const modeKey = (m: ArcadeModeBest) => `blacktop_arcade_${m.replace(/-/g, '_')}_hs`;
const MODE_BESTS: ArcadeModeBest[] = ['hit-heavy-flurry', 'hit-heavy-precision', 'petrol-head-misses'];
let modeSnapshot = {} as Record<ArcadeModeBest, number>;

function getModeSnapshot(): Record<ArcadeModeBest, number> {
  const next = {} as Record<ArcadeModeBest, number>;
  let changed = false;
  for (const m of MODE_BESTS) {
    next[m] = Number(localStorage.getItem(modeKey(m)) ?? 0) || 0;
    if (next[m] !== modeSnapshot[m]) changed = true;
  }
  if (changed) modeSnapshot = next;
  return modeSnapshot;
}

/** Save a mode best; returns true if it beats the old one. */
export function saveModeBest(mode: ArcadeModeBest, score: number): boolean {
  if (isDemoModeActive()) return score > DEMO_MODE_BESTS[mode];
  const current = Number(localStorage.getItem(modeKey(mode)) ?? 0) || 0;
  if (score <= current) return false;
  localStorage.setItem(modeKey(mode), String(score));
  listeners.forEach(cb => cb());
  return true;
}

export function useModeBests(): Record<ArcadeModeBest, number> {
  const real = useSyncExternalStore(subscribe, getModeSnapshot);
  const { enabled: demoEnabled } = useDemoMode();
  return demoEnabled ? DEMO_MODE_BESTS : real;
}
