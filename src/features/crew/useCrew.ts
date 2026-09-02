import { useSyncExternalStore } from 'react';

/**
 * Crew membership. Every rider owns a crew code (generated once, on device).
 * Scanning another rider's crew QR adopts their code, putting both riders in
 * the same crew. The code is the only thing shared - nothing else is published
 * unless the rider unlocks a convoy or opens the crew leaderboard.
 */
export interface CrewState {
  /** The crew this rider currently belongs to. Never null once initialised. */
  code: string;
  name: string;
  /** True when riding in their own crew (nobody scanned/joined elsewhere). */
  isOwn: boolean;
  joinedAt: number | null;
}

const LS_KEY = 'blacktop_crew';
const LS_OWN_KEY = 'blacktop_crew_own';
const listeners = new Set<() => void>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function ownCrewCode(): string {
  try {
    let own = localStorage.getItem(LS_OWN_KEY);
    if (!own) {
      own = generateCode();
      localStorage.setItem(LS_OWN_KEY, own);
    }
    return own;
  } catch {
    return 'BLKTOP';
  }
}

function read(): CrewState {
  const own = ownCrewCode();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CrewState>;
      if (parsed.code) {
        return {
          code: parsed.code,
          name: parsed.name || parsed.code,
          isOwn: parsed.code === own,
          joinedAt: parsed.joinedAt ?? null,
        };
      }
    }
  } catch {}
  return { code: own, name: `Crew ${own}`, isOwn: true, joinedAt: null };
}

let snapshot: CrewState = read();

function emit() {
  snapshot = read();
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Crew QR payload written into / read from the crew QR code. */
export const CREW_QR_PREFIX = 'blacktop:crew:';

export function parseCrewQr(text: string): string | null {
  const trimmed = text.trim();
  const raw = trimmed.toLowerCase().startsWith(CREW_QR_PREFIX)
    ? trimmed.slice(CREW_QR_PREFIX.length)
    : trimmed;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 10 ? code : null;
}

export function joinCrew(code: string, name?: string) {
  const clean = code.trim().toUpperCase();
  const state = {
    code: clean,
    name: name?.trim() || `Crew ${clean}`,
    joinedAt: Date.now(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  emit();
}

/** Returns to the rider's own crew. */
export function leaveCrew() {
  localStorage.removeItem(LS_KEY);
  emit();
}

export function useCrew() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
