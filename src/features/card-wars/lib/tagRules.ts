import { POWERS, type BattleCard, type DogTag, type TagPower } from '../types';
import { cardById } from './catalog';
import { V2 } from './rules';

/**
 * What a dog tag does, in numbers (plain maths, no app imports: the engine
 * and the balance scripts read this; `cw_tag_value` on the server is the same
 * sums). Strength is in hundredths for Overdrive (the rating multiplier) and
 * Second chance (the multiplier on the replay), and in HP for Pit medic.
 *
 * Under the second rule set a tag won on a spin is tied to a vehicle and takes
 * its strength from it: Overdrive from its G-force, Pit medic from its
 * Distance, Second chance from its Corners. So a tourer makes the best medic
 * and a MotoGP bike the best Overdrive. The three plain tags everyone has are
 * always a little weaker than any of those. Every tag with a vehicle does
 * more when it's played with the same kind (car or bike).
 */
const PLAIN: Record<TagPower, number> = V2 ? { boost: 135, heal: 20, reroll: 100 } : { boost: 150, heal: 30, reroll: 100 };
const MATCH: Record<TagPower, number> = V2 ? { boost: 10, heal: 6, reroll: 5 } : { boost: 15, heal: 8, reroll: 0 };

export const powerIndex = (power: TagPower): number => POWERS.indexOf(power);

/** The tag is tied to the kind of vehicle this card is. */
export const tagMatches = (tag: Pick<DogTag, 'vehicle'>, card: Pick<BattleCard, 'vehicle'> | null | undefined): boolean => !!card && !!tag.vehicle && tag.vehicle === card.vehicle;

/** A tag's strength before the bonus for a matching vehicle. */
export function tagBase(tag: Pick<DogTag, 'power' | 'card'>): number {
  const tied = V2 ? cardById(tag.card) : undefined;
  if (!tied) return PLAIN[tag.power];
  if (tag.power === 'boost') return 125 + Math.floor(tied.ratings.g / 2);
  if (tag.power === 'heal') return 14 + Math.floor((tied.ratings.distance * 32) / 100);
  return 100 + Math.max(0, Math.floor((tied.ratings.corners - 40) / 4));
}

/** A tag's strength when it's played with `card` (or on its own). */
export const tagStrength = (tag: Pick<DogTag, 'power' | 'card' | 'vehicle'>, card?: Pick<BattleCard, 'vehicle'> | null): number =>
  tagBase(tag) + (tagMatches(tag, card) ? MATCH[tag.power] : 0);

/** A tag won on a spin, as the app holds it. The server lists them as "power:card". */
export function vehicleTag(power: TagPower, cardId: string): DogTag | null {
  const tied = cardById(cardId);
  return tied ? { id: `tag:${power}:${cardId}`, name: `${tied.manufacturer} ${tied.name}`, power, vehicle: tied.vehicle, card: cardId } : null;
}

export function parseOwnedTag(entry: string): DogTag | null {
  const at = entry.indexOf(':');
  const power = entry.slice(0, at) as TagPower;
  return at > 0 && POWERS.includes(power) ? vehicleTag(power, entry.slice(at + 1)) : null;
}

/**
 * How a tag is named to the server for a player battle: the vehicle it's tied
 * to (checked against what the player owns), "~car" / "~bike" for a tag taken
 * on a track (plain strength, with the bonus for its kind), or nothing for a
 * plain one.
 */
export const tagRef = (tag: DogTag): string => tag.card ?? (tag.vehicle ? `~${tag.vehicle}` : '');
