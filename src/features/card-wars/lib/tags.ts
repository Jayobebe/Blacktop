import { CircleDollarSign, Heart, RefreshCw, Zap, type LucideIcon } from 'lucide-react';
import type { SpectreCard } from '@/features/cards';
import { tr } from '@/lib/i18n';
import { STARTER_TAGS } from './catalog';
import { parseOwnedTag, tagMatches, tagStrength } from './tagRules';
import type { BattleCard, DogTag, TagPower } from '../types';

export { tagMatches, tagStrength };
export type { TagPower };

/** Dog tags, as the app shows them. The numbers are lib/tagRules.ts. */
export const TAG_ORDER: TagPower[] = ['boost', 'heal', 'reroll', 'flip'];

export const TAG_ICON: Record<TagPower, LucideIcon> = { reroll: RefreshCw, heal: Heart, boost: Zap, flip: CircleDollarSign };

export function tagName(power: TagPower): string {
  switch (power) {
    case 'boost':
      return tr("Overdrive");
    case 'heal':
      return tr("Pit medic");
    case 'flip':
      return tr("Coin flip");
    default:
      return tr("Second chance");
  }
}

/** What a tag does in a few words, for the card it would be played with (or in general). */
export function tagEffect(tag: DogTag, card?: BattleCard | null): string {
  const strength = tagStrength(tag, card);
  if (tag.power === 'boost') return tr("Rating ×{0}", [String(strength / 100)]);
  if (tag.power === 'heal') return tr("+{0} HP", [strength]);
  if (tag.power === 'flip') return tr("Heads {0}%", [strength]);
  return strength > 100 ? tr("Replay +{0}%", [strength - 100]) : tr("Replay");
}

/** What a power does, as a sentence (how to play, the tag chooser). */
export function tagDescription(power: TagPower): string {
  switch (power) {
    case 'boost':
      return tr("Multiplies your card's rating for one round.");
    case 'heal':
      return tr("Gives the card you play HP back before the round.");
    case 'flip':
      return tr("Flips a coin for the category: heads, the one where your card has the biggest edge over theirs; tails, the one where it's furthest behind.");
    default:
      return tr("If you lose the round, it's replayed once in another category.");
  }
}

/** Where a tag's strength comes from, for the tag chooser. */
export function tagSourceLine(power: TagPower): string {
  switch (power) {
    case 'boost':
      return tr("An Overdrive is as strong as its vehicle's G-force.");
    case 'heal':
      return tr("A Pit medic is as strong as its vehicle's Distance.");
    case 'flip':
      return tr("A Coin flip lands heads more often the higher its vehicle's Speed.");
    default:
      return tr("A Second chance is as strong as its vehicle's Corners.");
  }
}

/** What a tag is tied to: its vehicle, the rider it was taken from, or nothing. */
export function tagTitle(tag: DogTag): string {
  if (tag.card) return tag.name;
  if (tag.spectre) return tr("{0}'s tag", [tag.name]);
  return tr("Standard tag");
}

/** The line under a tag's title: what it does more with. */
export function tagKindLine(tag: DogTag): string {
  if (!tag.vehicle) return tr("The same with any card");
  if (tag.vehicle === 'any') return tr("Earned on track: stronger with any card");
  return tag.vehicle === 'car' ? tr("Stronger with a car") : tr("Stronger with a bike");
}

/**
 * Every dog tag the player can put in a deck: the standard ones, the tags
 * taken from riders on Track Day boards, and the
 * tags won on spins. A Spectre's tag has the power spun for it in the vault
 * (none until its card has been turned over) and, being earned, its bonus
 * with cars and bikes alike.
 */
export function allTags(owned: string[], spectres: SpectreCard[]): DogTag[] {
  const track: DogTag[] = spectres.flatMap((s) => (s.power ? [spectreTag(s)] : []));
  const won = owned.flatMap((entry) => parseOwnedTag(entry) ?? []);
  return [...STARTER_TAGS, ...track, ...won];
}

/** The dog tag a Spectre gives, once its power has been spun for. */
export function spectreTag(s: SpectreCard & { power?: TagPower }): DogTag {
  return { id: `spectre:${s.key}`, name: s.setterName, spectre: s, power: s.power ?? 'boost', vehicle: 'any' };
}

/**
 * What a dog tag adds to a deck, in points beside the deck rating (the cards'
 * own average says nothing about the tags). Roughly what one use is worth:
 * an Overdrive by how far it lifts a rating, a Pit medic by the health it
 * gives back, a Second chance and a Coin flip by how much better than a plain
 * one they are. A plain tag is worth 3 or 4.
 */
export function tagPoints(tag: DogTag): number {
  const s = tagStrength(tag);
  if (tag.power === 'boost') return Math.round((s - 100) / 10);
  if (tag.power === 'heal') return Math.round(s / 5);
  if (tag.power === 'flip') return 3 + Math.round((s - 50) / 5);
  return 3 + Math.round((s - 100) / 3);
}
export const deckTagBonus = (tags: DogTag[]): number => tags.reduce((sum, t) => sum + tagPoints(t), 0);

/** The strongest tag of each power the player has, for filling a deck's empty slots. */
export function bestTag(tags: DogTag[], power: TagPower): DogTag | undefined {
  return tags.filter((t) => t.power === power).sort((a, b) => tagStrength(b) - tagStrength(a))[0];
}
