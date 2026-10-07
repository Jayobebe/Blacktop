/**
 * Card Wars balance: works out every card's ratings and price
 * and prints them for the two places they live, the BALANCE
 * table in src/features/card-wars/lib/catalog.ts and the `cw_catalog` rows in
 * a migration.
 *
 *   npm run cardwars:balance             the report, the table and the SQL
 *   npm run cardwars:balance -- --check  fails if catalog.ts is out of step
 *
 * Speed, G-force and Lean come from each card's published figures (the rows
 * in catalog.ts). Distance (endurance) and Corners (handling) are judgements,
 * kept here. A card's strength is the share of rounds it wins against every
 * other card (lib/strength.ts); the number on the card and its price both
 * follow that, so no card is a bargain and none is a rip-off. A spin on a
 * shelf costs about a fifth of what the shelf's cards cost on average.
 */
import { BALANCE, CATALOG, SPECS, SHELVES, SPIN_COST, categoryOf, type ShopCategory } from '../src/features/card-wars/lib/catalog';
import { fieldStrength, priceFromStrength, ratingFromStrength } from '../src/features/card-wars/lib/strength';
import type { BattleCard } from '../src/features/card-wars/types';

/** [distance, corners]. Road cards corner a class below the race builds (road tyres). */
const JUDGEMENT: Record<string, [number, number]> = {
  // road car
  '911': [62, 76], m3: [80, 62], '296gtb': [58, 76], '750s': [55, 75], amggtbs: [57, 74],
  gryaris: [72, 72], civic: [76, 70], mustangdh: [74, 56], mx5: [82, 68], gti: [84, 60],
  // road bike
  mt07: [72, 60], ninja: [70, 70], sv650: [78, 58], fireblade: [46, 74], panigale: [44, 76],
  gs: [92, 48], rs660f: [64, 72], '890duke': [62, 72], striple: [64, 74], f3rr: [52, 74],
  // race car (GT3 and GT4 cars run 24-hour races)
  gt3r: [70, 92], m4gt3: [68, 88], '296gt3': [68, 91], '720sgt3': [67, 89], amggt3: [70, 88],
  suprag4: [66, 80], nsxgt3: [68, 87], rally: [64, 90], mx5cup: [60, 84], gtitcr: [58, 82],
  // race bike (sprint races)
  r6: [40, 90], zx10rr: [36, 89], gsxr: [36, 86], firebladesbk: [34, 91], v4rsbk: [34, 93],
  s1000: [38, 88], rs660: [42, 90], rc8c: [38, 92], moto2: [36, 90], f3ss: [38, 88],
  // GTLM (Le Mans)
  c8r: [84, 88], c7r: [82, 86], rsr19: [78, 93], rsr17: [80, 90], '488gte': [78, 91],
  m8gte: [80, 85], m6gtlm: [76, 84], fordgt: [80, 90], vantagegte: [82, 88], lexusrcf: [76, 84],
  // Isle of Man TT (six laps of the Mountain Course; the electric Shinden does one)
  m1000tt: [64, 86], firebladett: [62, 85], zx10tt: [62, 84], gsxrtt: [63, 83], r1tt: [60, 85],
  norton: [60, 82], shinden: [24, 76], rc30: [58, 78], ow01: [58, 78], striplett: [30, 92],
  // F1
  rb19: [40, 99], w11: [40, 99], f2004: [38, 96], mp44: [34, 88], fw14b: [36, 94],
  w07: [40, 95], rb9: [38, 95], lotus79: [32, 86], mcl38: [40, 98], bgp001: [38, 93],
  // MotoGP
  gp23: [30, 96], rc213v: [30, 97], m1_15: [32, 98], gsxrr: [32, 97], rc16: [29, 95],
  rsgp: [32, 96], rc211v: [30, 94], gp7: [30, 90], m1_04: [30, 95], nsr500: [28, 93],
};

const clamp = (v: number) => Math.round(Math.max(10, Math.min(99, v)));
/** Top speed: 150 km/h → 20, 370 km/h → 99. */
const speedRating = (kmh: number) => clamp(20 + ((kmh - 150) / 220) * 79);
/** Power-to-weight, log scale: 150 hp/t → 20, doubling adds 20 (a MotoGP bike lands in the 90s, nothing hits the stop). */
const gRating = (hp: number, kg: number) => clamp(20 + 20 * Math.log2(((hp / kg) * 1000) / 150));
/** Max lean: 40° → 20, 64° → 99. Cars carry 30; Lean never comes up for them. */
const leanRating = (deg: number | undefined) => (deg == null ? 30 : clamp(20 + ((deg - 40) / 24) * 79));

const cards: BattleCard[] = CATALOG.map((c) => {
  const s = SPECS[c.id];
  const j = JUDGEMENT[c.id];
  if (!j) throw new Error(`No judgement for ${c.id}`);
  return { ...c, ratings: { speed: speedRating(s.vmaxKmh), lean: leanRating(s.leanDeg), g: gRating(s.hp, s.kg), distance: j[0], corners: j[1] } };
});

const rows = cards.map((card) => {
  const strength = fieldStrength(card, cards);
  const r = card.ratings;
  return { card, strength, rating: ratingFromStrength(strength), price: priceFromStrength(strength), line: [r.speed, r.lean, r.g, r.distance, r.corners] };
});

const seen = new Map<string, string>();
for (const { card, line } of rows) {
  const key = line.join(',');
  const twin = seen.get(key);
  if (twin) console.warn(`! ${card.id} has the same ratings as ${twin}`);
  seen.set(key, card.id);
}

const spin: Record<string, number> = {};
if (!process.argv.includes('--check')) console.log('Shelf        cards  rating     price      average  spin');
for (const shelf of SHELVES) {
  const on = rows.filter((r) => categoryOf(r.card) === shelf);
  const prices = on.map((r) => r.price);
  const ratings = on.map((r) => r.rating);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  spin[shelf] = Math.max(10, Math.round((average * 0.2) / 5) * 5);
  if (!process.argv.includes('--check'))
    console.log(`${shelf.padEnd(12)} ${String(on.length).padEnd(6)} ${`${Math.min(...ratings)}-${Math.max(...ratings)}`.padEnd(10)} ${`${Math.min(...prices)}-${Math.max(...prices)}`.padEnd(10)} ${average.toFixed(0).padEnd(8)} ${spin[shelf]}`);
}
const total = rows.reduce((a, r) => a + r.price, 0);

if (process.argv.includes('--check')) {
  const off = rows.filter((r) => [...r.line, r.price].join(',') !== (BALANCE[r.card.id] ?? []).join(','));
  const spinOff = SHELVES.filter((s) => SPIN_COST[s as ShopCategory] !== spin[s]);
  if (off.length || spinOff.length) {
    for (const r of off) console.error(`catalog.ts BALANCE.${r.card.id} is [${(BALANCE[r.card.id] ?? []).join(', ')}], should be [${[...r.line, r.price].join(', ')}]`);
    for (const s of spinOff) console.error(`catalog.ts SPIN_COST.${s} is ${SPIN_COST[s as ShopCategory]}, should be ${spin[s]}`);
    process.exit(1);
  }
  console.log(`Card Wars balance: ${rows.length} cards in step with catalog.ts.`);
} else {
  console.log(`\nEvery card bought outright: ${total} RPM\n`);
  for (const r of [...rows].sort((a, b) => b.strength - a.strength))
    console.log(`${String(r.rating).padStart(2)}  ${String(r.price).padStart(3)} RPM  ${(r.strength * 100).toFixed(1).padStart(4)}%  ${categoryOf(r.card).padEnd(6)} ${r.card.manufacturer} ${r.card.name}`);

  const key = (id: string) => (/^[a-z_][a-z0-9_]*$/i.test(id) ? id : `'${id}'`);
  console.log('\n── catalog.ts: BALANCE ──');
  const cells = rows.map((r) => `${key(r.card.id)}: [${[...r.line, r.price].join(', ')}]`);
  for (let i = 0; i < cells.length; i += 4) console.log(` ${cells.slice(i, i + 4).join(', ')},`);
  console.log(`\n── catalog.ts: SPIN_COST ──\n { ${SHELVES.map((s) => `${s}: ${spin[s]}`).join(', ')} }`);

  console.log('\n── migration: cw_catalog (id, vehicle, ratings, price, category) ──');
  const sql = rows.map((r) => `('${r.card.id}','${r.card.vehicle}','{${r.line.join(',')}}',${r.price},'${categoryOf(r.card)}')`);
  for (let i = 0; i < sql.length; i += 3) console.log(` ${sql.slice(i, i + 3).join(',')}${i + 3 < sql.length ? ',' : ''}`);
  console.log(`\n── migration: cw_spin_cost ──\n ${SHELVES.map((s) => `when '${s}' then ${spin[s]}`).join(' ')}`);
}
