import type { BattleCard, Category } from '../types';

/**
 * How strong a card is: the share of rounds it wins against every other card
 * in the catalogue, over the categories that can come up between the two
 * (Lean only when both are bikes; a tie counts half). It's what the number on
 * a card shows, and what prices follow. Plain maths, no app imports, so the
 * balance script can use it too.
 */
const COMMON: Category[] = ['speed', 'g', 'distance', 'corners'];
const WITH_LEAN: Category[] = [...COMMON, 'lean'];

/** Lean can come up for this card (a rider's own card may be a car wearing a bike's ratings). */
export const leans = (card: BattleCard) => (card.displayVehicle ?? card.vehicle) === 'bike';

/** The categories a round between two cards can be fought over. */
export const sharedCategories = (a: BattleCard, b: BattleCard): Category[] => (leans(a) && leans(b) ? WITH_LEAN : COMMON);

/** The chance `a` wins a round against `b`. */
export function roundOdds(a: BattleCard, b: BattleCard): number {
  const cats = sharedCategories(a, b);
  let won = 0;
  for (const c of cats) won += a.ratings[c] > b.ratings[c] ? 1 : a.ratings[c] === b.ratings[c] ? 0.5 : 0;
  return won / cats.length;
}

/** The share of rounds `card` wins against `field` (itself left out). */
export function fieldStrength(card: BattleCard, field: BattleCard[]): number {
  let total = 0;
  let count = 0;
  for (const other of field) {
    if (other.id === card.id) continue;
    total += roundOdds(card, other);
    count++;
  }
  return count ? total / count : 0.5;
}

/** Strength as the number on the card: a card that wins half its rounds is a 70. */
export const ratingFromStrength = (strength: number) => Math.max(20, Math.min(99, Math.round(20 + strength * 100)));

/** Price follows strength: about 30 RPM for the weakest card, under 500 for the strongest. */
export const priceFromStrength = (strength: number) => Math.max(30, Math.round((30 * Math.exp(4.9 * (strength - 0.2))) / 5) * 5);
