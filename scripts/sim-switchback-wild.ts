/**
 * npm run switchback:wild   (N=6000 for the figures in lib/redline.ts; about ten minutes)
 *
 * What a Wildcard is worth: the best deck against itself on hard, carrying Overdrive + Pit medic + the tag, for
 * no Wildcard, the rules before combos, the plain Wildcard and each combo in both versions. The player picks
 * cards at random, uses the medic on a hurt card and holds a combo for a card of its kind. Run it after any
 * change to the numbers in WILD: the combos are meant to land between 70 and 73 %, the plain one near 63 %.
 */
import { CATALOG } from '../src/features/switchback/lib/catalog';
import { createRun, playRound } from '../src/features/switchback/lib/engine';
import { fieldStrength, ratingFromStrength } from '../src/features/switchback/lib/strength';
import { tagStrength, vehicleTag } from '../src/features/switchback/lib/tagRules';
import { REDLINES, WILD_TAG, wildTag } from '../src/features/switchback/lib/redline';
import type { BattleCard, BattleState, DogTag } from '../src/features/switchback/types';

const by = (id: string) => CATALOG.find((c) => c.id === id)!;
const rated = CATALOG.map((c) => ({ c, r: ratingFromStrength(fieldStrength(c, CATALOG)) })).sort((a, b) => b.r - a.r);
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
// As last week's: the medic for a hurt card, the Wildcard held for a card of its kind, anything else as soon as it can.
const policy = (s: BattleState, i: number, tags: DogTag[]) => {
  const left = tags.filter((t) => !s.usedTags.includes(t.id));
  const heal = left.find((t) => t.power === 'heal');
  if (heal && s.hp[0][i] <= 55) return heal;
  return left.find((t) => t.power !== 'heal' && !(t.power === 'wild' && t.combo && s.player[i].vehicle !== t.vehicle) && !(t.power === 'wild' && t.combo === 'heal' && s.hp[0][i] > 50));
};
const baseRun = JSON.stringify(createRun(rated.slice(20, 25).map((x) => x.c), rng(5), { level: 'hard' }));
function battle(deck: BattleCard[], foe: BattleCard[], tags: DogTag[], wheel: BattleCard[], seed: number, combos: boolean): number {
  const random = rng(seed);
  let s: BattleState = { ...JSON.parse(baseRun), id: String(seed), player: deck, opponent: foe, hp: [[100, 100, 100, 100, 100], [100, 100, 100, 100, 100]], wheel, penaltyRound: -1, combos };
  for (let n = 0; n < 300 && !s.result; n++) {
    const alive = s.hp[0].map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const i = alive[Math.floor(random() * alive.length)];
    const next = playRound(s, i, policy(s, i, tags), random);
    if (next === s) break;
    s = next;
  }
  return s.result === 'win' ? 1 : s.result === 'draw' ? 0.5 : 0;
}
const N = Number(process.env.N || 1500);
const tag = (power: 'boost' | 'heal' | 'reroll' | 'flip') => CATALOG.map((c) => vehicleTag(power, c.id)!).sort((a, b) => tagStrength(b) - tagStrength(a))[0];
const OD = tag('boost'), MED = tag('heal'), SEC = tag('reroll');
const best = 'w11,f2004,gp23,rsgp,m1_15'.split(',').map(by);
const wheel = 'thrustssc,escudo,tatra815,rc166,tz750'.split(',').map((id) => REDLINES.find((r) => r.id === id)!);
const rows: [string, DogTag[], boolean, BattleCard[]?][] = [
  ['no Wildcard', [OD, MED, SEC], true],
  ['today (old rules)', [OD, MED, WILD_TAG], false, 'busa311,thrustssc,escudo,tz750,rc166'.split(',').map((id) => REDLINES.find((r) => r.id === id)!)],
  ['plain', [OD, MED, WILD_TAG], true],
  ...(['heal', 'reroll', 'flip', 'boost'] as const).flatMap((c) => (['bike', 'car'] as const).map((v): [string, DogTag[], boolean] => [`${c} ${v}`, [OD, MED, wildTag(c, v)], true])),
];
for (const [label, tags, combos, w] of rows) {
  let wins = 0;
  for (let k = 0; k < N; k++) wins += battle(best, best, tags, w ?? wheel, 1000 + k * 7, combos);
  console.log(((wins / N) * 100).toFixed(1).padStart(6), ' ', label);
}
