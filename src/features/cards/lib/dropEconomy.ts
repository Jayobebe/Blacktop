/**
 * Card copy economy.
 *
 * Your card always keeps one copy locked in Stats — it can never be dropped.
 * Copies are earned:
 *   • every card tier milestone reached (Bronze, Silver, Gold, …) on any bike
 *   • every weekly crew challenge you complete
 *
 * Copy 2 goes in your own vault. From copy 3 onward copies become droppable.
 */
import { TIER_LADDER } from '../types';

const CHALLENGE_KEY = 'bt.card_challenge_copies.v1';

/** Milestone copies earned across every vehicle in the garage. */
export function tierCopiesEarned(ridesPerBike: number[]): number {
  let earned = 0;
  for (const rides of ridesPerBike) {
    for (const t of TIER_LADDER) {
      if (t.id !== 'locked' && rides >= t.minRides) earned += 1;
    }
  }
  return earned;
}

export function claimedChallengeWeeks(): string[] {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Records a completed weekly challenge as a card copy (idempotent per week). */
export function grantChallengeCopy(week: string): boolean {
  const weeks = claimedChallengeWeeks();
  if (weeks.includes(week)) return false;
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify([...weeks, week]));
    window.dispatchEvent(new CustomEvent('blacktop-card-copies'));
    return true;
  } catch {
    return false;
  }
}

export interface CopyLedger {
  /** Total copies in existence, including the one locked in Stats. */
  total: number;
  /** Copies that may be planted on the map (total − stats copy − vault copy). */
  droppable: number;
  /** Copies currently planted. */
  placed: number;
  /** Copies still in hand, ready to drop. */
  available: number;
}

export function copyLedger(ridesPerBike: number[], placed: number): CopyLedger {
  const total = 1 + tierCopiesEarned(ridesPerBike) + claimedChallengeWeeks().length;
  const droppable = Math.max(0, total - 2);
  return { total, droppable, placed, available: Math.max(0, droppable - placed) };
}
