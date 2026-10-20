import { WILD_COMBOS, type BattleCard, type DogTag, type WildCombo } from '../types';

/**
 * Redline cards: one-off machines that never sit in a deck. Five of them are
 * on the player's wheel, and the Wildcard dog tag puts one in a card's place
 * for a round. Every Redline's four main ratings (Speed, G-force, Distance,
 * Corners) add up to `REDLINE.budget` with at least one 100 and one 0, so none
 * is simply better than another, only different. Lean is on top, for bikes.
 *
 * The server holds the same rows in `cw_redline_cards` (migration
 * 20261021000000_card_wars_redline.sql): keep ids and ratings in step. Plain
 * data, no app imports: the engine and the check script read it.
 */
/**
 * The last three are what a Redline does in a round, to be worth how rare it is (the engine and `cw_action`
 * both do them): the rev counter never stops on a card whose rating in the drawn category is 0, a Redline
 * that wins hits as hard as a hit can, and one that loses takes the loss itself (the player's card isn't
 * touched). Measured on the best deck against itself: the Wildcard alone went from no better than no tag to
 * the second best tag there is, behind Overdrive.
 */
export const REDLINE = { budget: 240, wheel: 5, odds: 2, pity: 40, starter: 5, dailyOneIn: 3, noZero: true, fullHit: true, shield: true };

// id, maker, name, vehicle, speed, lean, g-force, distance, corners
type Row = [string, string, string, 'car' | 'bike', number, number, number, number, number];
const rows: Row[] = [
  ['thrustssc', 'Thrust', 'SSC', 'car', 100, 30, 90, 50, 0],
  ['chaparral2j', 'Chaparral', '2J', 'car', 55, 30, 85, 0, 100],
  ['p91730', 'Porsche', '917/30', 'car', 90, 30, 100, 0, 50],
  ['escudo', 'Suzuki', 'Escudo Pikes Peak', 'car', 0, 30, 90, 50, 100],
  ['tatra815', 'Tatra', '815 Dakar', 'car', 0, 30, 70, 100, 70],
  ['britten', 'Britten', 'V1000', 'bike', 55, 100, 100, 0, 85],
  ['rc166', 'Honda', 'RC166', 'bike', 60, 90, 0, 80, 100],
  ['busa311', 'Suzuki', 'Hayabusa Turbo 311', 'bike', 100, 35, 95, 45, 0],
  ['xr750', 'Harley-Davidson', 'XR750', 'bike', 0, 70, 60, 100, 80],
  ['tz750', 'Yamaha', 'TZ750 Flat Tracker', 'bike', 85, 50, 100, 55, 0],
];

export const REDLINES: BattleCard[] = rows.map(([id, manufacturer, name, vehicle, speed, lean, g, distance, corners]) => ({
  id,
  name,
  manufacturer,
  vehicle,
  spec: 'race',
  archetype: id,
  redline: true,
  image: `/switchback/${vehicle === 'car' ? 'cars' : 'bikes'}/${id}.png`,
  ratings: { speed, lean, g, distance, corners },
}));

export const redlineById = (id: string | null | undefined): BattleCard | undefined => (id ? REDLINES.find((c) => c.id === id) : undefined);

/** The Wildcard dog tag: one an account, so one a deck. */
export const WILD_TAG: DogTag = { id: 'tag-wild', name: 'Wildcard', power: 'wild' };

/**
 * The combo rules (migration 20261026000000_card_wars_wild_combos.sql; the engine and `cw_action` both do
 * them, and they replace noZero / fullHit / shield once the server has them). Every spin counts: the dial can
 * stop on any of the five, a 0 included. A Redline that wins hits the rival's card for `win`; one that loses
 * blows up on the player's own card for `blow`. Lean is fought only by bike Redlines.
 *
 * A combo is a Wildcard crossed with a power, in a car and a bike version. On a deck card of its kind the
 * best Redline for the category takes half the dial and the combo's own effect applies; on the other kind
 * it's a plain Wildcard.
 *   heal: the played card heals to full and every other card standing heals `healDeck`;
 *   reroll: a loss spins again in another category and lands on the best Redline left;
 *   flip: a coin, heads `heads` %: the best Redline, and `splash` to the rival's next card; tails the worst (`tailsWin` if it still wins);
 *   boost: `splash` to the rival's next card.
 * `streak`: wins in a row with a Wildcard in the deck that unlock the next combo.
 * Simulated (Overdrive + Pit medic + the tag, the best deck against itself on hard, 6,000 battles): no
 * Wildcard 61.5 %, plain 63.2 %, the combos 71 to 72.5 %.
 */
export const WILD = {
  win: { plain: 80, heal: 80, reroll: 100, flip: 100, boost: 100 },
  blow: { plain: 10, heal: 20, reroll: 20, flip: 25, boost: 30 },
  splash: { plain: 0, heal: 0, reroll: 0, flip: 30, boost: 60 },
  tailsWin: 80,
  heads: 75,
  healDeck: 15,
  streak: 5,
} as const;

/** A combo Wildcard as the app holds it. The server lists them as "combo.vehicle". */
export const wildTag = (combo: WildCombo, vehicle: 'car' | 'bike'): DogTag => ({ id: `tag-wild:${combo}:${vehicle}`, name: 'Wildcard', power: 'wild', combo, vehicle });
export function parseWildTag(entry: string): DogTag | null {
  const [combo, vehicle] = entry.split('.');
  return WILD_COMBOS.includes(combo as WildCombo) && (vehicle === 'car' || vehicle === 'bike') ? wildTag(combo as WildCombo, vehicle) : null;
}
/** What an armed Wildcard plays as with this card: its combo on a card of its kind, plain otherwise. */
export const wildKind = (tag: Pick<DogTag, 'combo' | 'vehicle'>, card: Pick<BattleCard, 'vehicle'>): WildCombo | 'plain' => (tag.combo && tag.vehicle === card.vehicle ? tag.combo : 'plain');
