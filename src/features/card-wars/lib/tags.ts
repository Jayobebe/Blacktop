import { CircleDollarSign, Heart, RefreshCw, Zap, type LucideIcon } from 'lucide-react';
import type { SpectreCard } from '@/features/cards';
import { tr } from '@/lib/i18n';
import { STARTER_TAGS } from './catalog';
import { matchOwn } from './ownMatch';
import { BUILDS, FLIP, V2 } from './rules';
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
  if (!V2) return tr("New category");
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
      return tr("Flips a coin for the category: heads, your card's best rating; tails, its worst.");
    default:
      return V2 ? tr("If you lose the round, it's replayed once in another category.") : tr("Throws the drawn category away and draws another.");
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
 * taken from riders on Track Day boards, and under the second rule set the
 * tags won on spins. A Spectre's tag has the power spun for it in the vault
 * (none until its card has been turned over) and, being earned, its bonus
 * with cars and bikes alike. Before builds each rider's tag took a power in
 * turn and was tied to the kind of vehicle they rode.
 */
export function allTags(owned: string[], spectres: SpectreCard[]): DogTag[] {
  const track: DogTag[] = BUILDS
    ? spectres.flatMap((s) => (s.power ? [spectreTag(s)] : []))
    : spectres.map((s, i) => ({
        id: `spectre:${s.key}`,
        name: s.setterName,
        spectre: s,
        power: STARTER_TAGS[i % 3].power,
        vehicle: matchOwn(s.card.n, s.card.m, 'bike').vehicle,
      }));
  // A Coin flip won on a spin only exists on a server that knows the tag.
  const won = V2 ? owned.flatMap((entry) => parseOwnedTag(entry) ?? []).filter((t) => FLIP || t.power !== 'flip') : [];
  return [...STARTER_TAGS, ...track, ...won];
}

/** The dog tag a Spectre gives, once its power has been spun for. */
export function spectreTag(s: SpectreCard & { power?: TagPower }): DogTag {
  return { id: `spectre:${s.key}`, name: s.setterName, spectre: s, power: s.power ?? 'boost', vehicle: 'any' };
}

/** The strongest tag of each power the player has, for filling a deck's empty slots. */
export function bestTag(tags: DogTag[], power: TagPower): DogTag | undefined {
  return tags.filter((t) => t.power === power).sort((a, b) => tagStrength(b) - tagStrength(a))[0];
}
