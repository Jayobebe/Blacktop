/**
 * How dear a place is next to its kind, as 1 to 5 in half steps (shown as
 * currency signs), from what OpenStreetMap says about it: there's no free
 * source of real prices, so it's an estimate, and only where there's
 * something to go on.
 *
 *  - Parking and charging: their `fee` and `charge` tags. Free is free (no
 *    signs); a charge per hour or per kWh is put on a scale.
 *  - Fuel, shops, coffee and food: the brand (or operator, or name). Big
 *    chains price alike everywhere: supermarket forecourts are the cheapest
 *    fuel and motorway services the dearest; discounters the cheapest shops,
 *    the posh grocers the dearest, with convenience branches in between.
 *  - Anything else, an independent café say, has no rating: none beats a guess.
 *
 * Imports nothing.
 */

export type PriceInfo = { free: true } | { level: number };

type Tags = Record<string, string | undefined>;
type Table = [string, number][];

/** Fuel by brand or operator, cheapest first. */
const FUEL: Table = [
  // Motorway services (the operator, whatever the brand on the pumps).
  ['moto', 5], ['welcome break', 5], ['roadchef', 5], ['extra msa', 5], ['westmorland', 4.5],
  // Supermarkets and warehouse clubs.
  ['costco', 1], ["sam's club", 1], ['bj\'s', 1], ['asda', 1], ['morrisons', 1], ['sainsbury', 1.5], ['tesco', 1.5],
  ['walmart', 1], ['murphy', 1], ['kroger', 1.5], ['leclerc', 1], ['intermarch', 1], ['carrefour', 1.5], ['auchan', 1],
  ['super u', 1], ['système u', 1], ['systeme u', 1], ['lidl', 1], ['aldi', 1], ['globus', 1.5], ['kaufland', 1],
  ['mercadona', 1], ['plenoil', 1], ['ballenoil', 1],
  // Independents and value brands.
  ['jet', 1.5], ['gulf', 2], ['star', 2], ['q8', 2], ['tinq', 1.5], ['tango', 1.5], ['avia', 2], ['circle k', 2.5],
  ['texaco', 2.5], ['esso', 2.5], ['valero', 2], ['speedway', 2], ['citgo', 2], ['repsol', 2.5], ['cepsa', 2.5],
  ['galp', 2.5], ['totalenergies', 2.5], ['total', 2.5], ['eni', 2.5], ['ip', 2.5], ['tamoil', 2],
  // The majors.
  ['shell', 3], ['bp', 3], ['aral', 3], ['omv', 3], ['chevron', 3.5], ['mobil', 3], ['exxon', 3], ['sunoco', 3], ['76', 3],
];

/** Supermarkets and convenience stores, the branch type before the brand ("Tesco Express" before "Tesco"). */
const SHOPS: Table = [
  ['tesco express', 3.5], ['tesco extra', 2], ["sainsbury's local", 3.5], ['sainsburys local', 3.5], ['little waitrose', 4.5],
  ['m&s food', 4.5], ['marks & spencer', 4.5], ['marks and spencer', 4.5], ['carrefour express', 3.5], ['carrefour city', 3.5],
  ['waitrose', 4.5], ['whole foods', 5], ['planet organic', 5], ['booths', 4], ['the fresh market', 4], ['eataly', 4.5],
  ['aldi', 1], ['lidl', 1], ['netto', 1], ['penny', 1], ['norma', 1], ['biedronka', 1], ['dia', 1.5], ['iceland', 1.5],
  ['food warehouse', 1.5], ['b&m', 1.5], ['costco', 1.5], ['walmart', 1.5], ['asda', 1.5], ['kaufland', 1.5], ['mercadona', 1.5],
  ['tesco', 2], ['sainsbury', 2], ['morrisons', 2], ['carrefour', 2], ['auchan', 2], ['leclerc', 1.5], ['intermarch', 2],
  ['rewe', 2.5], ['edeka', 2.5], ['albert heijn', 2.5], ['jumbo', 2], ['kroger', 2], ['target', 2], ['safeway', 2.5],
  ['co-op', 3.5], ['coop', 3], ['spar', 3.5], ['londis', 3.5], ['budgens', 3.5], ['one stop', 3.5], ['nisa', 3.5],
  ['premier', 3.5], ['costcutter', 3.5], ['mace', 3.5], ['centra', 3.5], ['7-eleven', 3.5], ['circle k', 3.5],
  ['family mart', 3], ['lawson', 3], ['proxi', 3.5], ['vival', 3.5],
];

/** Coffee chains. */
const COFFEE: Table = [
  ['greggs', 1], ["mcdonald", 1], ['tim hortons', 1.5], ['dunkin', 1.5], ['coffee#1', 2.5], ['costa', 2.5],
  ['caffè nero', 2.5], ['caffe nero', 2.5], ['starbucks', 3], ['pret', 3], ['black sheep', 3.5], ['joe & the juice', 4],
  ["gail's", 4], ['gails', 4], ['blank street', 3], ['la colombe', 3.5],
];

/** Restaurant and takeaway chains. */
const FOOD: Table = [
  ["mcdonald", 1], ['burger king', 1], ['kfc', 1], ['subway', 1], ['greggs', 1], ['taco bell', 1], ["wendy", 1],
  ['popeyes', 1], ['tim hortons', 1], ['wetherspoon', 1.5], ["domino", 2], ['pizza hut', 2], ['toby carvery', 2],
  ['five guys', 2.5], ["nando", 2.5], ['harvester', 2.5], ['wagamama', 3], ['pizza express', 3], ['pizzaexpress', 3],
  ['zizzi', 3], ['prezzo', 3], ['bella italia', 2.5], ['frankie & benny', 3], ['beefeater', 3], ["bill's", 3.5],
  ['côte', 3.5], ['cote brasserie', 3.5], ['dishoom', 3.5], ['miller & carter', 4], ['hawksmoor', 5], ['gaucho', 5],
];

/** Each name as a whole word (so "ip" doesn't match "Skipton" and "bp" doesn't match "bpm"), compiled once. */
const words = (table: Table): [RegExp, number][] =>
  table.map(([key, level]) => [new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`), level]);
const compiled = new Map<Table, [RegExp, number][]>();

function byName(tags: Tags, table: Table): number | null {
  const names = [tags.brand, tags.operator, tags.name].filter(Boolean).map((n) => n!.toLowerCase());
  if (!names.length) return null;
  let list = compiled.get(table);
  if (!list) compiled.set(table, (list = words(table)));
  for (const [re, level] of list) if (names.some((n) => re.test(n))) return level;
  return null;
}

/** The first amount in a charge ("£1.50/hour", "2 EUR/h", "0.45 GBP/kWh") and what it's per. */
function chargeOf(charge: string): { amount: number; per: 'hour' | 'day' | 'kwh' | null } | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(charge);
  if (!m) return null;
  const amount = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  const c = charge.toLowerCase();
  const per = /kwh/.test(c) ? 'kwh' : /\/\s*(h|hr|hour)\b|per hour|\/h\b/.test(c) ? 'hour' : /day|24\s*h/.test(c) ? 'day' : null;
  return { amount, per };
}

const scale = (x: number, steps: number[]) => {
  // 1 at or under the first step, 5 over the last, halves between.
  for (let i = 0; i < steps.length; i++) if (x <= steps[i]) return 1 + i * 0.5;
  return 5;
};

/** How dear this place is next to its kind, or null when there's nothing to go on. */
export function priceInfo(tags: Tags | undefined): PriceInfo | null {
  if (!tags) return null;
  const amenity = tags.amenity;
  const shop = tags.shop;
  if (amenity === 'parking' || amenity === 'motorcycle_parking' || amenity === 'bicycle_parking' || amenity === 'charging_station') {
    if (tags.fee === 'no' || tags.charge === '0') return { free: true };
    const charge = tags.charge ? chargeOf(tags.charge) : null;
    if (charge?.per === 'kwh') return { level: scale(charge.amount, [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76]) };
    if (charge?.per === 'hour') return { level: scale(charge.amount, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.5]) };
    if (charge?.per === 'day') return { level: scale(charge.amount / 8, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.5]) };
    return null;
  }
  if (amenity === 'fuel') return level(byName(tags, FUEL));
  if (shop === 'supermarket' || shop === 'convenience') return level(byName(tags, SHOPS));
  if (amenity === 'cafe') return level(byName(tags, COFFEE));
  if (amenity === 'fast_food') return level(byName(tags, FOOD) ?? 1.5);
  if (amenity === 'restaurant') return level(byName(tags, FOOD));
  return null;
}

const level = (n: number | null): PriceInfo | null => (n === null ? null : { level: n });

/** The sign for the country the places are in (a dollar where it's anything else). */
export function currencySign(countryCode: string | null | undefined): string {
  const c = (countryCode ?? '').toLowerCase();
  if (['gb', 'uk', 'im', 'je', 'gg'].includes(c)) return '£';
  if (['de', 'fr', 'es', 'it', 'nl', 'be', 'at', 'ie', 'pt', 'fi', 'gr', 'sk', 'si', 'ee', 'lv', 'lt', 'lu', 'mt', 'cy', 'hr'].includes(c)) return '€';
  if (c === 'jp' || c === 'cn') return '¥';
  if (c === 'in') return '₹';
  if (c === 'kr') return '₩';
  if (c === 'tr') return '₺';
  if (c === 'ua') return '₴';
  return '$';
}
