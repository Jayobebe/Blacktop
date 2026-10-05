import type { CardTier } from '@/features/cards/types';
import { CATEGORIES, type BattleCard, type Category } from '../types';
import { CATALOG, SPECS } from './catalog';

/**
 * A rider's own card in Card Wars. It starts from its catalog match (the Road
 * card nearest to the vehicle, ownMatch.ts), then the rider's riding lifts it:
 * each figure is turned into a rating on the catalogue's scale, and only the
 * gap above the match counts, scaled by the card's tier and never more than
 * MAX_LIFT a category. So riding makes a card the best of its kind, not a
 * different kind of machine: a well-ridden 600 doesn't pass a superbike.
 * Riding never makes a card worse. The server holds the same limit. Pure maths: the
 * figures never leave the phone, only the finished ratings do (player battles).
 */
export const TIER_SHARE: Record<CardTier, number> = {
  locked: 0,
  bronze: 0.25,
  silver: 0.5,
  gold: 1,
  platinum: 1.1,
  ruby: 1.25,
  diamond: 1.5,
  obsidian: 2,
  polyatomic: 2,
  orion: 2,
};

/** The most riding can add to any one rating (`cw_action` refuses more). */
export const MAX_LIFT = 12;

export interface RideFigures {
  topSpeedMph: number | null;
  maxGForce: number | null;
  maxLean: number | null;
  totalDistanceMi: number;
}

const best = Object.fromEntries(CATEGORIES.map((c) => [c, Math.max(...CATALOG.map((x) => x.ratings[c]))])) as Record<Category, number>;
const overall = (r: Record<Category, number>) => (r.speed + r.g + r.distance + r.corners) / 4;
const BEST_OVERALL = Math.max(...CATALOG.map((c) => overall(c.ratings)));
const lerp = (v: number, v0: number, v1: number, r0: number, r1: number) => r0 + ((Math.max(v0, Math.min(v1, v)) - v0) / (v1 - v0)) * (r1 - r0);

/** Top speed on the catalogue's own curve: the rating a catalog vehicle that fast has. */
function speedRating(kmh: number, vehicle: 'car' | 'bike'): number {
  const pts = CATALOG.filter((c) => c.vehicle === vehicle && SPECS[c.id])
    .map((c) => [SPECS[c.id].vmaxKmh, c.ratings.speed] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  if (kmh <= pts[0][0]) return pts[0][1] * (kmh / pts[0][0]);
  for (let i = 1; i < pts.length; i++) if (kmh <= pts[i][0]) return lerp(kmh, pts[i - 1][0], pts[i][0], pts[i - 1][1], pts[i][1]);
  return pts[pts.length - 1][1];
}

/** What the riding alone is worth, category by category. */
export function ridingRatings(f: RideFigures, vehicle: 'car' | 'bike'): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  if (f.topSpeedMph != null) out.speed = speedRating(f.topSpeedMph * 1.609344, vehicle);
  if (f.maxGForce != null) out.g = lerp(f.maxGForce, 0.4, 1.6, 20, best.g);
  if (vehicle === 'bike' && f.maxLean != null) out.lean = lerp(f.maxLean, 15, 62, 20, best.lean);
  if (f.totalDistanceMi > 0) out.distance = lerp(Math.log10(f.totalDistanceMi), Math.log10(50), Math.log10(20000), 20, best.distance);
  const cornering = [out.g, out.lean].filter((v): v is number => v != null);
  if (cornering.length) out.corners = cornering.reduce((a, b) => a + b, 0) / cornering.length;
  return out;
}

/** The ratings an own card battles with. Without figures (peaks hidden) it's the catalog match, as before. */
export function ownRatings(base: BattleCard, figures: RideFigures | null, tier: CardTier | undefined): Record<Category, number> {
  const r = { ...base.ratings };
  const share = TIER_SHARE[tier ?? 'locked'] ?? 0;
  if (!figures || share <= 0) return r;
  const riding = ridingRatings(figures, base.vehicle);
  const lift: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const v = riding[c];
    if (v == null || (c === 'lean' && base.vehicle !== 'bike')) continue;
    lift[c] = Math.min(MAX_LIFT, Math.max(0, v - base.ratings[c]) * share);
  }
  const apply = (k: number) => {
    const out = { ...base.ratings };
    for (const c of CATEGORIES) out[c] = Math.min(best[c], Math.round(base.ratings[c] + (lift[c] ?? 0) * k));
    return out;
  };
  let out = apply(1);
  // Never past the catalogue's strongest card overall: scale the lift back until it fits.
  if (overall(out) > BEST_OVERALL) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (overall(apply(mid)) > BEST_OVERALL) hi = mid;
      else lo = mid;
    }
    out = apply(lo);
  }
  return out;
}

/** The server's order (`cw_catalog.ratings`). */
export const ratingsArray = (r: Record<Category, number>) => CATEGORIES.map((c) => r[c]);
export const ratingsFrom = (a: number[] | null | undefined): Record<Category, number> | null =>
  Array.isArray(a) && a.length === 5 ? (Object.fromEntries(CATEGORIES.map((c, i) => [c, a[i]])) as Record<Category, number>) : null;
