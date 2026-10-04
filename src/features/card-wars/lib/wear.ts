import type { BattleCard, BattleState } from '../types';

/** Condition lost per battle a card fights in: race builds wear out faster than road cards. */
export const WEAR_PER_BATTLE = { factory: 8, race: 15 } as const;
/** Condition regained per battle a card sits out (resting in the garage). */
export const REST_RECOVERY = 10;

export function conditionOf(wear: Record<string, number> | undefined, id: string): number {
  const v = wear?.[id];
  return typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 100;
}

/** Game ratings at a given condition. Stats hold until 50%, then fade to half at 0%.
 *  Race cards' distance fades from the first battle: road cards go further between rebuilds. */
export function withWear(card: BattleCard, condition: number): BattleCard {
  const general = condition >= 50 ? 1 : 1 - (50 - condition) * 0.01;
  const distance = card.spec === 'race' ? general * (0.6 + 0.4 * condition / 100) : general;
  const r = card.ratings;
  const scale = (v: number, m: number) => Math.round(v * m);
  return {
    ...card,
    condition,
    ratings: { speed: scale(r.speed, general), lean: scale(r.lean, general), g: scale(r.g, general), corners: scale(r.corners, general), distance: scale(r.distance, distance) },
  };
}

/** Condition after a finished offline run: cards that fought wear, the rest recover. */
export function wearAfterRun(wear: Record<string, number> | undefined, run: BattleState, owned: BattleCard[]): Record<string, number> {
  const fought = new Set(run.log.map(l => l.player));
  const next: Record<string, number> = { ...(wear || {}) };
  for (const card of owned) {
    const c = conditionOf(wear, card.id);
    next[card.id] = fought.has(card.id) ? Math.max(0, c - WEAR_PER_BATTLE[card.spec]) : Math.min(100, c + REST_RECOVERY);
  }
  return next;
}
