import { CardTier, TIER_LADDER, TierDef } from '../types';

export function getTierForRides(rides: number): TierDef {
  let current = TIER_LADDER[0];
  for (const t of TIER_LADDER) {
    if (rides >= t.minRides) current = t;
    else break;
  }
  return current;
}

export function getNextTier(rides: number): TierDef | null {
  for (const t of TIER_LADDER) {
    if (t.minRides > rides) return t;
  }
  return null;
}

export function ridesToNext(rides: number): number {
  const next = getNextTier(rides);
  return next ? Math.max(0, next.minRides - rides) : 0;
}

const TIER_RANK: Record<CardTier, number> = TIER_LADDER.reduce(
  (acc, t, i) => {
    acc[t.id] = i;
    return acc;
  },
  {} as Record<CardTier, number>,
);

export function tierRank(t: CardTier): number {
  return TIER_RANK[t] ?? 0;
}
