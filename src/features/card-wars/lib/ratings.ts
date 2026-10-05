import { CornerUpRight, Gauge, RotateCw, Route, Zap, type LucideIcon } from 'lucide-react';
import type { CardTier } from '@/features/cards/types';
import { tr } from '@/lib/i18n';
import { CATALOG, cardById } from './catalog';
import { fieldStrength, leans, ratingFromStrength } from './strength';
import type { BattleCard, Category } from '../types';

/** The order ratings are shown in, everywhere. */
export const CATEGORY_ORDER: Category[] = ['speed', 'corners', 'g', 'distance', 'lean'];

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  speed: Gauge,
  corners: CornerUpRight,
  g: Zap,
  distance: Route,
  lean: RotateCw,
};

export function categoryLabel(c: Category): string {
  switch (c) {
    case 'speed':
      return tr("Speed");
    case 'corners':
      return tr("Corners");
    case 'g':
      return tr("G-force");
    case 'distance':
      return tr("Distance");
    default:
      return tr("Lean");
  }
}

/** Lean can come up for this card, so it's shown. */
export const isBike = leans;

/** The ratings a card shows. Lean is a bike's: it never comes up for a car. */
export const categoriesOf = (card: BattleCard): Category[] => CATEGORY_ORDER.filter((c) => c !== 'lean' || isBike(card));

/**
 * The number on a card: how often it wins a round against every card in the
 * catalogue (a card that wins half is a 70). Worked out from the ratings it
 * has right now, so a worn card shows what it's really worth.
 */
const cache = new WeakMap<BattleCard, number>();
export function overall(card: BattleCard): number {
  let rating = cache.get(card);
  if (rating === undefined) {
    rating = ratingFromStrength(fieldStrength(card, CATALOG));
    cache.set(card, rating);
  }
  return rating;
}

/** A deck's strength: the average of its cards. */
export function deckRating(cards: BattleCard[]): number | null {
  return cards.length ? Math.round(cards.reduce((sum, c) => sum + overall(c), 0) / cards.length) : null;
}

/**
 * The frame a card wears. A rider's own card keeps the tier it earned on the
 * road; a catalog card's follows its rating when new, so the look says how
 * strong it is (and doesn't change as it wears).
 */
export function tierOf(card: BattleCard): CardTier {
  if (card.tier) return card.tier;
  const rating = overall(cardById(card.id) ?? card);
  return rating >= 90 ? 'obsidian' : rating >= 80 ? 'diamond' : rating >= 70 ? 'platinum' : rating >= 60 ? 'gold' : rating >= 50 ? 'silver' : 'bronze';
}
