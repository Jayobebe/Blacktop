import { POWERS, type BattleCard, type DogTag, type TagPower } from '../types';
import { cardById } from './catalog';

/**
 * What a dog tag does, in numbers (plain maths, no app imports: the engine
 * and the balance scripts read this; `cw_tag_value` on the server is the same
 * sums). Strength is in hundredths for Overdrive (the rating multiplier) and
 * Second chance (the multiplier on the replay), in HP for Pit medic, and the
 * chance of heads in percent for Coin flip.
 *
 * A tag won on a spin is tied to a vehicle and takes
 * its strength from it: Overdrive from its G-force, Pit medic from its
 * Distance, Second chance from its Corners, Coin flip from its Speed. So a
 * tourer makes the best medic and a MotoGP bike the best Overdrive. The plain tags everyone has are
 * always a little weaker than any of those. Every tag with a vehicle does
 * more when it's played with the same kind (car or bike).
 */
const PLAIN: Record<TagPower, number> = { boost: 135, heal: 20, reroll: 100, flip: 50 };
const MATCH: Record<TagPower, number> = { boost: 10, heal: 6, reroll: 5, flip: 4 };

export const powerIndex = (power: TagPower): number => POWERS.indexOf(power);

/** The tag gets its bonus with this card: it's tied to that kind of vehicle, or (a Spectre's, earned on track) to any. */
export const tagMatches = (tag: Pick<DogTag, 'vehicle'>, card: Pick<BattleCard, 'vehicle'> | null | undefined): boolean => tag.vehicle === 'any' || (!!card && !!tag.vehicle && tag.vehicle === card.vehicle);

/** A tag's strength before the bonus for a matching vehicle. */
export function tagBase(tag: Pick<DogTag, 'power' | 'card'>): number {
  const tied = cardById(tag.card);
  if (!tied) return PLAIN[tag.power];
  if (tag.power === 'boost') return 125 + Math.floor(tied.ratings.g / 2);
  if (tag.power === 'heal') return 14 + Math.floor((tied.ratings.distance * 32) / 100);
  if (tag.power === 'flip') return 50 + Math.floor(tied.ratings.speed / 6);
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
 * to (checked against what the player owns), "~all" for a tag taken on a track
 * (plain strength, with the bonus whatever it's played with; "~car" / "~bike"
 * before builds), or nothing for a plain one.
 */
export const tagRef = (tag: DogTag): string => tag.card ?? (tag.vehicle ? (tag.vehicle === 'any' ? '~all' : `~${tag.vehicle}`) : '');

/** A deck slot as the server takes it under builds: "power:ref", or "-" for an empty one. */
export const slotRef = (tag: DogTag | undefined): string => (tag ? `${tag.power}:${tagRef(tag)}` : '-');

/** The categories a Coin flip can land on: never Lean, so it means the same against a car or a bike. */
const FLIP_CATEGORIES = ['speed', 'g', 'distance', 'corners'] as const;

/**
 * What a Coin flip picks against the card it's facing: on heads the category
 * where `mine` leads `theirs` by most (or trails by least), on tails the one
 * where it's furthest behind (the first of equals, in the server's order).
 */
export function flipCategory(mine: BattleCard['ratings'], theirs: BattleCard['ratings'], heads: boolean): (typeof FLIP_CATEGORIES)[number] {
  const lead = (c: (typeof FLIP_CATEGORIES)[number]) => mine[c] - theirs[c];
  let pick: (typeof FLIP_CATEGORIES)[number] = FLIP_CATEGORIES[0];
  for (const c of FLIP_CATEGORIES) if (heads ? lead(c) > lead(pick) : lead(c) < lead(pick)) pick = c;
  return pick;
}
