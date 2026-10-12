/**
 * npm run cardwars:best   (a couple of minutes on eight cores; SCALE=4 for four times the battles, POOL=32 for a wider field of cards, DECKS=12 for more finalists)
 *
 * Looks for the strongest build there is: five cards, three dog tags and, when one of them is a Wildcard, the
 * five Redlines on its wheel. It plays player battles (both sides carry dog tags, `cw_action`'s rules with the
 * combo Wildcards), without round events and with unworn cards, in a simulator of its own that is fast enough
 * to play tens of millions of them. Both sides pick a standing card at random; a Pit medic goes on a card at 55
 * HP or less, every other tag is armed as soon as it can be (a combo Wildcard is held for a card of its kind,
 * the Pit medic combo for one at 50 HP or less).
 *
 * Not every five of the 80 cards is played (24 million decks, times tags, times wheels). What is left out is
 * left out for a reason that can be checked:
 *   1. a card that five others of its kind match or beat in every rating can't be in the best deck;
 *   2. of the rest, the cards are ranked by what a round is worth with them against the strongest field (which
 *      adds up across a deck when cards are picked at random), and every five of the top `POOL` is played. The
 *      report says how far down that ranking the best decks reach: if they reach its end, raise POOL.
 * Then, for the best decks: every wheel of five from the ten Redlines for the plain Wildcard and each of the
 * eight combos, and every set of three dog tags (each power's strongest tag tied to a car and to a bike).
 * The last table is the finalists against each other.
 */
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/features/card-wars/lib/catalog';
import { REDLINES, WILD } from '../src/features/card-wars/lib/redline';
import { DAMAGE } from '../src/features/card-wars/lib/rules';
import { tagStrength, vehicleTag } from '../src/features/card-wars/lib/tagRules';
import { WILD_COMBOS } from '../src/features/card-wars/types';

// ── What a battle is made of ─────────────────────────────────────────────────
// Ratings in the server's order: speed, lean, g-force, distance, corners.
interface Card { id: string; bike: boolean; r: number[] }
const card = (c: { id: string; vehicle: string; ratings: Record<string, number> }): Card => ({ id: c.id, bike: c.vehicle === 'bike', r: [c.ratings.speed, c.ratings.lean, c.ratings.g, c.ratings.distance, c.ratings.corners] });
const CARDS = new Map(CATALOG.map((c) => [c.id, card(c)]));
const REDS = new Map(REDLINES.map((c) => [c.id, card(c)]));
const NONLEAN = [0, 2, 3, 4];

/** A dog tag: power 0 reroll, 1 heal, 2 boost, 3 flip, 4 wild; its strength with a car and with a bike; a Wildcard's combo (-1 plain) and kind. */
interface Tag { p: number; car: number; bike: number; combo: number; veh: number; name: string }
/** "boost.car" (the strongest Overdrive tied to a car), "heal.bike", "wild", "wild.flip.car"… */
function tagOf(spec: string): Tag {
  const [power, a, b] = spec.split('.');
  if (power === 'wild') return { p: 4, car: 0, bike: 0, combo: a ? WILD_COMBOS.indexOf(a as never) : -1, veh: b === 'bike' ? 1 : 0, name: spec };
  const p = ['reroll', 'heal', 'boost', 'flip'].indexOf(power);
  const best = CATALOG.filter((c) => c.vehicle === a)
    .map((c) => vehicleTag(power as never, c.id)!)
    .sort((x, y) => tagStrength(y) - tagStrength(x))[0];
  return { p, car: tagStrength(best, { vehicle: 'car' }), bike: tagStrength(best, { vehicle: 'bike' }), combo: -1, veh: 0, name: `${spec} (${best.name})` };
}
/** One side as it's sent between threads, and as it's played. */
export interface Config { cards: string[]; tags: string[]; wheel?: string[] }
interface Side { cards: Card[]; tags: Tag[]; heal: number; wheel: Card[] | null; wheelBike: boolean }
const side = (c: Config): Side => {
  const tags = c.tags.map(tagOf);
  const wheel = c.wheel?.length ? c.wheel.map((id) => REDS.get(id)!) : null;
  return { cards: c.cards.map((id) => CARDS.get(id)!), tags, heal: tags.findIndex((t) => t.p === 1), wheel, wheelBike: !!wheel?.some((w) => w.bike) };
};

// ── The simulator ────────────────────────────────────────────────────────────
let seed = 1;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
// By kind: -1 plain (index 0), then heal, reroll, flip, boost.
const WIN = [WILD.win.plain, WILD.win.heal, WILD.win.reroll, WILD.win.flip, WILD.win.boost];
const BLOW = [WILD.blow.plain, WILD.blow.heal, WILD.blow.reroll, WILD.blow.flip, WILD.blow.boost];
let heads = false;
/** Where the rev counter stops (`cw_wild_spin`). */
function spin(wheel: Card[], cat: number, kind: number, not: number, sure: boolean): number {
  let best = -1, worst = -1, n = 0;
  for (let k = 0; k < wheel.length; k++) {
    if (k === not || (cat === 1 && !wheel[k].bike)) continue;
    n++;
    if (best < 0 || wheel[k].r[cat] > wheel[best].r[cat]) best = k;
    if (worst < 0 || wheel[k].r[cat] <= wheel[worst].r[cat]) worst = k;
  }
  if (n === 0) return (rand() * wheel.length) | 0;
  if (sure) return best;
  if (kind === 2) {
    heads = rand() * 100 < WILD.heads;
    return heads ? best : worst;
  }
  const top = kind >= 0 ? Math.max(1, n - 1) : 1;
  let r = rand() * (n - 1 + top);
  for (let k = 0; k < wheel.length; k++) {
    if (k === not || (cat === 1 && !wheel[k].bike)) continue;
    r -= k === best ? top : 1;
    if (r < 0) return k;
  }
  return best;
}
/** A Coin flip's category against the card it faces: the widest lead on heads, the furthest behind on tails; never Lean. */
function flipCat(mine: number[], theirs: number[], h: boolean): number {
  let pick = 0;
  for (const c of NONLEAN) if (h ? mine[c] - theirs[c] > mine[pick] - theirs[pick] : mine[c] - theirs[c] < mine[pick] - theirs[pick]) pick = c;
  return pick;
}
/** The tag a side arms for this card (-1: none). */
function arm(s: Side, used: number, hp: number, bike: boolean): number {
  if (s.heal >= 0 && !(used & (1 << s.heal)) && hp <= 55) return s.heal;
  for (let t = 0; t < s.tags.length; t++) {
    const tag = s.tags[t];
    if (used & (1 << t) || tag.p === 1) continue;
    if (tag.p === 4) {
      if (!s.wheel) continue;
      if (tag.combo >= 0 && tag.veh !== (bike ? 1 : 0)) continue;
      if (tag.combo === 0 && hp > 50) continue;
    }
    return t;
  }
  return -1;
}
const ha = [0, 0, 0, 0, 0], hb = [0, 0, 0, 0, 0], la = [0, 0, 0, 0, 0], lb = [0, 0, 0, 0, 0];
/** One battle: 1 if A wins, 0.5 for a draw. */
function battle(A: Side, B: Side): number {
  for (let k = 0; k < 5; k++) ha[k] = hb[k] = 100;
  let ua = 0, ub = 0;
  for (let round = 0; round < 200; round++) {
    let na = 0, nb = 0;
    for (let k = 0; k < 5; k++) {
      if (ha[k] > 0) la[na++] = k;
      if (hb[k] > 0) lb[nb++] = k;
    }
    if (!na || !nb) break;
    const i = la[(rand() * na) | 0], j = lb[(rand() * nb) | 0];
    const ca = A.cards[i], cb = B.cards[j];
    const ta = arm(A, ua, ha[i], ca.bike), tb = arm(B, ub, hb[j], cb.bike);
    if (ta >= 0) ua |= 1 << ta;
    if (tb >= 0) ub |= 1 << tb;
    const TA = ta >= 0 ? A.tags[ta] : null, TB = tb >= 0 ? B.tags[tb] : null;
    let leanOk = ca.bike && cb.bike;
    let cat = leanOk ? (rand() * 5) | 0 : NONLEAN[(rand() * 4) | 0];
    let ra = ca.r, rb = cb.r;
    // -2: no Wildcard; -1 plain; 0.. the combo it plays as with this card.
    const ka = TA && TA.p === 4 ? (TA.combo >= 0 && TA.veh === (ca.bike ? 1 : 0) ? TA.combo : -1) : -2;
    const kb = TB && TB.p === 4 ? (TB.combo >= 0 && TB.veh === (cb.bike ? 1 : 0) ? TB.combo : -1) : -2;
    if (cat === 1 && ((ka > -2 && !A.wheelBike) || (kb > -2 && !B.wheelBike))) cat = NONLEAN[(rand() * 4) | 0];
    let wa = -1, wb = -1, headsA = false, headsB = false;
    if (ka > -2) {
      wa = spin(A.wheel!, cat, ka, -1, false);
      headsA = heads;
      ra = A.wheel![wa].r;
    }
    if (kb > -2) {
      wb = spin(B.wheel!, cat, kb, -1, false);
      headsB = heads;
      rb = B.wheel![wb].r;
    }
    if (wa >= 0 || wb >= 0) leanOk = false;
    if (TA && TA.p === 1) ha[i] = Math.min(100, ha[i] + (ca.bike ? TA.bike : TA.car));
    if (TB && TB.p === 1) hb[j] = Math.min(100, hb[j] + (cb.bike ? TB.bike : TB.car));
    const ba = TA && TA.p === 2 ? (ca.bike ? TA.bike : TA.car) / 100 : 1;
    const bb = TB && TB.p === 2 ? (cb.bike ? TB.bike : TB.car) / 100 : 1;
    let fa = -1, fb = -1;
    if (TA && TA.p === 3) fa = flipCat(ra, rb, rand() * 100 < (ca.bike ? TA.bike : TA.car));
    if (TB && TB.p === 3) fb = flipCat(rb, ra, rand() * 100 < (cb.bike ? TB.bike : TB.car));
    if (fa >= 0 || fb >= 0) cat = fa >= 0 && fb >= 0 && fa !== fb ? (rand() < 0.5 ? fa : fb) : fa >= 0 ? fa : fb;
    let sa = ra[cat] * ba, sb = rb[cat] * bb;
    // A lost round replayed: an ordinary Second chance, or a Second chance combo's second spin.
    if ((sa < sb && ((TA && TA.p === 0) || (ka === 1 && A.wheel!.length > 1))) || (sb < sa && ((TB && TB.p === 0) || (kb === 1 && B.wheel!.length > 1)))) {
      let ma = 1, mb = 1;
      if (sa < sb && TA && TA.p === 0) ma = (ca.bike ? TA.bike : TA.car) / 100;
      else if (sb < sa && TB && TB.p === 0) mb = (cb.bike ? TB.bike : TB.car) / 100;
      const first = cat;
      do cat = leanOk ? (rand() * 5) | 0 : NONLEAN[(rand() * 4) | 0];
      while (cat === first);
      if (sa < sb && ka === 1) {
        wa = spin(A.wheel!, cat, ka, wa, true);
        ra = A.wheel![wa].r;
      } else if (sb < sa && kb === 1) {
        wb = spin(B.wheel!, cat, kb, wb, true);
        rb = B.wheel![wb].r;
      }
      sa = ra[cat] * ba * ma;
      sb = rb[cat] * bb * mb;
    }
    if (sa === sb) continue;
    const won = sa > sb;
    let dmg = Math.min(DAMAGE.cap, DAMAGE.floor + Math.round(Math.abs(sa - sb) * DAMAGE.gap));
    // A Redline that wins hits for its tag's damage; one that loses to an ordinary card blows up on its own side.
    if (won && wa >= 0) dmg = ka === 2 && !headsA ? WILD.tailsWin : WIN[ka + 1];
    else if (!won && wb >= 0) dmg = kb === 2 && !headsB ? WILD.tailsWin : WIN[kb + 1];
    else if (!won && wa >= 0) dmg = BLOW[ka + 1];
    else if (won && wb >= 0) dmg = BLOW[kb + 1];
    if (won) hb[j] = Math.max(0, hb[j] - dmg);
    else ha[i] = Math.max(0, ha[i] - dmg);
    if (won && wa >= 0) {
      const spill = ka === 3 ? WILD.splash.boost : ka === 2 && headsA ? WILD.splash.flip : 0;
      if (spill) for (let k = 0; k < 5; k++) if (hb[k] > 0 && k !== j) { hb[k] = Math.max(0, hb[k] - spill); break; }
      if (ka === 0) for (let k = 0; k < 5; k++) ha[k] = k === i ? 100 : ha[k] > 0 ? Math.min(100, ha[k] + WILD.healDeck) : 0;
    } else if (!won && wb >= 0) {
      const spill = kb === 3 ? WILD.splash.boost : kb === 2 && headsB ? WILD.splash.flip : 0;
      if (spill) for (let k = 0; k < 5; k++) if (ha[k] > 0 && k !== i) { ha[k] = Math.max(0, ha[k] - spill); break; }
      if (kb === 0) for (let k = 0; k < 5; k++) hb[k] = k === j ? 100 : hb[k] > 0 ? Math.min(100, hb[k] + WILD.healDeck) : 0;
    }
  }
  let a = 0, b = 0;
  for (let k = 0; k < 5; k++) {
    a += ha[k];
    b += hb[k];
  }
  return a === b ? 0.5 : a > b ? 1 : 0;
}
/** Each config's share of battles won against the references, `n` battles a reference. */
function rate(configs: Config[], refs: Config[], n: number, s: number): number[] {
  const R = refs.map(side);
  return configs.map((c, at) => {
    const A = side(c);
    seed = (s + at * 2654435761) | 0 || 1;
    let w = 0;
    for (const B of R) for (let k = 0; k < n; k++) w += battle(A, B);
    return w / (n * R.length);
  });
}

// ── Workers ──────────────────────────────────────────────────────────────────
if (!isMainThread) {
  parentPort!.on('message', (m: { id: number; configs: Config[]; refs: Config[]; n: number; seed: number }) => parentPort!.postMessage({ id: m.id, out: rate(m.configs, m.refs, m.n, m.seed) }));
} else {
  void main();
}

async function main() {
  const QUICK = Number(process.env.SCALE || (process.env.QUICK ? 0.1 : 1));
  const POOL = Number(process.env.POOL || 24);
  const threads = Math.max(1, os.cpus().length - 1);
  const workers = Array.from({ length: threads }, () => new Worker(fileURLToPath(import.meta.url), { workerData: null }));
  void workerData;
  let job = 0;
  let played = 0;
  /** Win rates for `configs` against `refs`, spread across the workers. */
  const run = async (configs: Config[], refs: Config[], n: number): Promise<number[]> => {
    n = Math.max(4, Math.round(n * QUICK));
    played += configs.length * refs.length * n;
    const size = Math.ceil(configs.length / (threads * 4)) || 1;
    const chunks: Config[][] = [];
    for (let k = 0; k < configs.length; k += size) chunks.push(configs.slice(k, k + size));
    const out: number[][] = new Array(chunks.length);
    let next = 0;
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((done) => {
            const give = () => {
              if (next >= chunks.length) return void done();
              const at = next++;
              const id = ++job;
              const on = (m: { id: number; out: number[] }) => {
                if (m.id !== id) return;
                w.off('message', on);
                out[at] = m.out;
                give();
              };
              w.on('message', on);
              w.postMessage({ id, configs: chunks[at], refs, n, seed: 7919 * id });
            };
            give();
          }),
      ),
    );
    return out.flat();
  };
  const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + ' %';
  const t0 = Date.now();
  const log = (s: string) => console.log(s);
  const mins = () => ((Date.now() - t0) / 60000).toFixed(1);

  // 1. Cards five others of their kind match or beat everywhere can't be in the best deck.
  const all = [...CARDS.values()];
  const beats = (b: Card, a: Card) => b !== a && b.bike === a.bike && NONLEAN.every((k) => b.r[k] >= a.r[k]) && (!a.bike || b.r[1] >= a.r[1]);
  const live = all.filter((a) => all.filter((b) => beats(b, a)).length < 5);
  // 2. What a round is worth with a card against a field: the damage it's expected to deal less what it takes.
  const worth = (a: Card, field: Card[]) => {
    let sum = 0;
    for (const b of field) {
      const cats = a.bike && b.bike ? [0, 1, 2, 3, 4] : NONLEAN;
      for (const c of cats) if (a.r[c] !== b.r[c]) sum += ((a.r[c] > b.r[c] ? 1 : -1) * Math.min(DAMAGE.cap, DAMAGE.floor + Math.round(Math.abs(a.r[c] - b.r[c]) * DAMAGE.gap))) / cats.length;
    }
    return sum / field.length;
  };
  let field = live;
  let ranked = live;
  for (let pass = 0; pass < 4; pass++) {
    ranked = live.slice().sort((x, y) => worth(y, field) - worth(x, field));
    field = ranked.slice(0, 15);
  }
  const pool = ranked.slice(0, POOL);
  const rank = new Map(ranked.map((c, k) => [c.id, k + 1]));
  log(`${all.length} cards, ${live.length} not outclassed five times over; every five of the top ${POOL} by worth against the strongest fifteen:`);
  log(pool.map((c, k) => `${k + 1} ${c.id}`).join('  '));

  /** The strongest ordinary build for a deck: each power's best tag tied to the kind the deck has more of. */
  const std = (cards: string[]): Config => {
    const v = cards.filter((id) => CARDS.get(id)!.bike).length >= 3 ? 'bike' : 'car';
    return { cards, tags: [`boost.${v}`, `heal.${v}`, `reroll.${v}`] };
  };
  const decks: string[][] = [];
  (function pick(start: number, cur: string[]) {
    if (cur.length === 5) return void decks.push(cur.slice());
    for (let k = start; k < pool.length; k++) pick(k + 1, [...cur, pool[k].id]);
  })(0, []);
  const top = (xs: Card[]) => xs.slice(0, 5).map((c) => c.id);
  let refs: Config[] = [
    std(['w11', 'f2004', 'rb19', 'gp23', 'rsgp']),
    std(['w11', 'f2004', 'gp23', 'rsgp', 'm1_15']),
    std(top(ranked)),
    std(top(ranked.filter((c) => !c.bike))),
    std(top(ranked.filter((c) => c.bike))),
  ];
  /** Plays `configs` in rounds, keeping the best share each time. */
  const sift = async <T extends Config>(configs: T[], against: Config[], steps: [number, number][]): Promise<{ c: T; r: number }[]> => {
    let left = configs.map((c) => ({ c, r: 0 }));
    for (const [n, keep] of steps) {
      const r = await run(left.map((x) => x.c), against, n);
      left = left.map((x, k) => ({ c: x.c, r: r[k] })).sort((x, y) => y.r - x.r).slice(0, keep);
    }
    return left;
  };

  // ── The five cards, with the strongest ordinary dog tags on both sides ──
  let best = await sift(decks.map(std), refs, [[40, 4000], [400, 400], [3000, 60]]);
  log(`\n${decks.length} decks played (${mins()} min). Round two: the best six become the field.`);
  for (let pass = 0; pass < 2; pass++) {
    refs = best.slice(0, 6).map((x) => x.c);
    best = await sift(best.map((x) => x.c), refs, [[4000, 60]]);
  }
  log(`The best decks against the best six of them (ordinary tags both sides; the numbers after a card are its place in the ranking above):`);
  for (const x of best.slice(0, 15)) log(`  ${pct(x.r)}  ${x.c.cards.map((id) => `${id}(${rank.get(id)})`).join(' ')}`);
  const deepest = Math.max(...best.slice(0, 15).flatMap((x) => x.c.cards.map((id) => rank.get(id)!)));
  log(`  The deepest card in those fifteen is number ${deepest} of ${POOL}${deepest > POOL - 3 ? ': close to the edge, run again with a bigger POOL' : ''}.`);

  // ── The Wildcard: every wheel, for the plain tag and each combo, on the best decks ──
  const finalists = best.slice(0, Number(process.env.DECKS || 8)).map((x) => x.c.cards);
  const wheels: string[][] = [];
  (function pick(start: number, cur: string[]) {
    if (cur.length === 5) return void wheels.push(cur.slice());
    for (let k = start; k < REDLINES.length; k++) pick(k + 1, [...cur, REDLINES[k].id]);
  })(0, []);
  const wilds = ['wild', ...WILD_COMBOS.flatMap((c) => [`wild.${c}.car`, `wild.${c}.bike`])];
  const bestWheel = new Map<string, string[]>();
  for (const cards of finalists) {
    const base = std(cards).tags;
    for (const w of wilds) {
      const found = await sift(wheels.map((wheel) => ({ cards, tags: [base[0], base[1], w], wheel })), refs, [[60, 20], [1500, 1]]);
      bestWheel.set(`${cards.join()}|${w}`, found[0].c.wheel!);
    }
    log(`  wheels for ${cards.join(' ')} done (${mins()} min)`);
  }

  // ── Every set of three dog tags on those decks ──
  const powers = ['boost', 'heal', 'reroll', 'flip'];
  const builds: Config[] = [];
  for (const cards of finalists) {
    const versions = (ps: string[]): string[][] => ps.reduce<string[][]>((acc, p) => acc.flatMap((a) => [[...a, `${p}.car`], [...a, `${p}.bike`]]), [[]]);
    for (let skip = 0; skip < 4; skip++) for (const tags of versions(powers.filter((_, k) => k !== skip))) builds.push({ cards, tags });
    for (let x = 0; x < 4; x++)
      for (let y = x + 1; y < 4; y++)
        for (const tags of versions([powers[x], powers[y]])) for (const w of wilds) builds.push({ cards, tags: [...tags, w], wheel: bestWheel.get(`${cards.join()}|${w}`) });
  }
  const strong = await sift(builds, refs, [[300, 400], [3000, 40]]);
  log(`\n${builds.length} builds played (${mins()} min). The best against the field of ordinary builds:`);
  const show = (c: Config) => `${c.cards.join(' ')} | ${c.tags.join(', ')}${c.wheel ? ` | wheel ${c.wheel.join(' ')}` : ''}`;
  for (const x of strong.slice(0, 12)) log(`  ${pct(x.r)}  ${show(x.c)}`);

  // ── The finalists against each other: the best build is the one that holds up against the other best builds ──
  let last = strong.slice(0, 16).map((x) => x.c);
  for (let pass = 0; pass < 2; pass++) {
    const r = await run(last, last, 4000);
    const order = last.map((c, k) => ({ c, r: r[k] })).sort((x, y) => y.r - x.r);
    if (pass === 1) {
      log(`\nThe finalists against each other (4,000 battles a pairing):`);
      for (const x of order) log(`  ${pct(x.r)}  ${show(x.c)}`);
      const one = order[0].c;
      const names = (ids: string[], from: typeof CATALOG) => ids.map((id) => { const c = from.find((k) => k.id === id)!; return `${c.manufacturer} ${c.name}`; }).join(', ');
      log(`\nBest build found:\n  Cards: ${names(one.cards, CATALOG)}\n  Dog tags: ${one.tags.map((t) => tagOf(t).name).join('; ')}${one.wheel ? `\n  Wheel: ${names(one.wheel, REDLINES)}` : ''}`);
    }
    // Round two: the best eight, each also with its nearest rivals' wheels and tags already in the list.
    last = order.slice(0, 10).map((x) => x.c);
  }
  log(`\n${(played / 1e6).toFixed(1)} million battles in ${mins()} minutes.`);
  await Promise.all(workers.map((w) => w.terminate()));
}
