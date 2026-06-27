import { useSyncExternalStore } from 'react';
import type { ArcadeGame, ArcadeScores } from '../types';
import { useDemoMode, DEMO_SCORES } from '@/lib/demoMode';

const LS_KEYS: Record<ArcadeGame, string> = {
  'hit-heavy': 'blacktop_arcade_hit_heavy_hs',
  'petrol-head': 'blacktop_arcade_petrol_head_hs',
};

const listeners = new Set<() => void>();

// Stable reference so useSyncExternalStore doesn't see a change on every render
let cachedSnapshot: ArcadeScores = { 'hit-heavy': 0, 'petrol-head': 0 };

function getSnapshot(): ArcadeScores {
  const hh = Number(localStorage.getItem(LS_KEYS['hit-heavy']) ?? 0);
  const ph = Number(localStorage.getItem(LS_KEYS['petrol-head']) ?? 0);
  if (hh !== cachedSnapshot['hit-heavy'] || ph !== cachedSnapshot['petrol-head']) {
    cachedSnapshot = { 'hit-heavy': hh, 'petrol-head': ph };
  }
  return cachedSnapshot;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Save a score; returns true if it's a new personal best. */
export function saveScore(game: ArcadeGame, score: number): boolean {
  const current = Number(localStorage.getItem(LS_KEYS[game]) ?? 0);
  if (score > current) {
    localStorage.setItem(LS_KEYS[game], String(score));
    listeners.forEach(cb => cb());
    return true;
  }
  return false;
}

export function useArcadeScores() {
  const scores = useSyncExternalStore(subscribe, getSnapshot);
  return { scores };
}
