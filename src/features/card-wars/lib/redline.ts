import type { BattleCard, DogTag } from '../types';

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
export const REDLINE = { budget: 240, wheel: 5, odds: 2, pity: 40, starter: 5, dailyOneIn: 3 } as const;

// id, maker, name, vehicle, speed, lean, g-force, distance, corners
type Row = [string, string, string, 'car' | 'bike', number, number, number, number, number];
const rows: Row[] = [
  ['thrustssc', 'Thrust', 'SSC', 'car', 100, 30, 90, 50, 0],
  ['chaparral2j', 'Chaparral', '2J', 'car', 55, 30, 85, 0, 100],
  ['p91730', 'Porsche', '917/30', 'car', 90, 30, 100, 0, 50],
  ['escudo', 'Suzuki', 'Escudo Pikes Peak', 'car', 0, 30, 90, 50, 100],
  ['tatra815', 'Tatra', '815 Dakar', 'car', 0, 30, 70, 100, 70],
  ['britten', 'Britten', 'V1000', 'bike', 55, 95, 100, 0, 85],
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
  image: `/card-wars/${vehicle === 'car' ? 'cars' : 'bikes'}/${id}.png`,
  ratings: { speed, lean, g, distance, corners },
}));

export const redlineById = (id: string | null | undefined): BattleCard | undefined => (id ? REDLINES.find((c) => c.id === id) : undefined);

/** The Wildcard dog tag: one an account, so one a deck. */
export const WILD_TAG: DogTag = { id: 'tag-wild', name: 'Wildcard', power: 'wild' };
