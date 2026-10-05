import { CATEGORIES, type BattleCard, type BattleState, type Category, type DogTag } from '../types';
import { BRAND_CARDS, CATALOG } from './catalog';
import { V2, damageFor } from './rules';
import { fieldStrength } from './strength';
import { tagStrength } from './tagRules';
import { EVENT_NUMBERS, rollEvent } from './events';

/**
 * Battles against the computer, settled on the phone (player battles are the
 * server's: `cw_action`, same rules). Plain maths and the catalog only, so the
 * balance scripts can run it in Node.
 */
export function shuffle<T>(values: T[], random: () => number = Math.random): T[] {
  const a = values.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The categories a round can be fought over: Lean only when both cards are bikes. */
const allowedFor = (mine: BattleCard, theirs: BattleCard): Category[] =>
  CATEGORIES.filter((c) => c !== 'lean' || ((mine.displayVehicle ?? mine.vehicle) === 'bike' && theirs.vehicle === 'bike'));

/**
 * Neutral, category-blind play, used only before a battle to judge how hard a
 * computer deck is for this player. Dog tags and the player's choices are
 * deliberately left out.
 */
export const COMPUTER_WIN_TARGET = 0.51;

function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function estimatePlayerWins(player: BattleCard[], opponent: BattleCard[], trials = 128, seed = 1): number {
  const random = seededRandom(seed);
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) {
    const hp = [Array(5).fill(100), Array(5).fill(100)];
    const penaltyRound = random() < 0.125 ? 1 + Math.floor(random() * 4) : -1;
    for (let round = 0; round < 400; round++) {
      const alive = hp.map((hand) => hand.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0));
      if (!alive[0].length || !alive[1].length) break;
      const aIndex = alive[0][Math.floor(random() * alive[0].length)];
      const bIndex = alive[1][Math.floor(random() * alive[1].length)];
      const aCard = player[aIndex];
      const bCard = opponent[bIndex];
      const allowed = allowedFor(aCard, bCard);
      const category = allowed[Math.floor(random() * allowed.length)];
      const penalty = penaltyRound === round && category === 'lean' ? 0.8 : 1;
      const difference = (aCard.ratings[category] - bCard.ratings[category]) * penalty;
      if (difference !== 0) {
        const loser = difference > 0 ? 1 : 0;
        const index = loser === 0 ? aIndex : bIndex;
        hp[loser][index] = Math.max(0, hp[loser][index] - Math.min(65, 20 + Math.round(Math.abs(difference) * 0.7)));
      }
    }
    // A stalled or level neutral game counts as half a win, for matchmaking only.
    const totals = hp.map((hand) => hand.reduce((a, b) => a + b, 0));
    wins += totals[0] === totals[1] ? 0.5 : totals[0] > totals[1] ? 1 : 0;
  }
  return wins / trials;
}

/**
 * The cards the computer may field. Under the first rule set, only the cards a
 * win can earn; under the second the whole catalogue, so a deck of F1 cars
 * meets its match (the prize is still a Road or Race card, see `prizesFor`).
 */
const COMPUTER_POOL = V2 ? CATALOG : BRAND_CARDS;

/**
 * Picks real catalog cards: never weakens their ratings or rigs a round. A
 * bounded search gets as near the target as the catalogue allows. It keeps
 * the player's own cards out where it can (a card meeting itself only ties,
 * and its prize would be one they have): only a deck at the very bottom or
 * top of the catalogue, with nothing else its size to meet, shares any.
 */
export function createComputerDeck(player: BattleCard[], random: () => number = Math.random): BattleCard[] {
  const all = COMPUTER_POOL;
  const others = all.filter((c) => !player.some((p) => p.id === c.id));
  const seed = Math.floor(random() * 4294967296);
  const usesLean = player.every((c) => (c.displayVehicle ?? c.vehicle) === 'bike');
  const power = (card: BattleCard) => {
    const categories = CATEGORIES.filter((c) => c !== 'lean' || (usesLean && card.vehicle === 'bike'));
    return categories.reduce((sum, c) => sum + card.ratings[c], 0) / categories.length;
  };
  const targetPower = player.reduce((sum, card) => sum + power(card), 0) / player.length;
  const nearest = (pool: BattleCard[]) =>
    pool
      .slice()
      .sort((a, b) => Math.abs(power(a) - targetPower) - Math.abs(power(b) - targetPower))
      .slice(0, 12);
  const near = nearest(others);
  const nearAll = nearest(all);
  const shared = (deck: BattleCard[]) => deck.filter((c) => player.some((p) => p.id === c.id)).length;
  const candidates = [
    all.slice().sort((a, b) => power(a) - power(b)).slice(0, 5),
    all.slice().sort((a, b) => power(b) - power(a)).slice(0, 5),
    ...Array.from({ length: 16 }, () => shuffle(near, random).slice(0, 5)),
    ...Array.from({ length: 14 }, () => shuffle(others, random).slice(0, 5)),
    ...Array.from({ length: 8 }, () => shuffle(nearAll, random).slice(0, 5)),
  ].filter((deck) => shared(deck) < 5);
  // How far from a fair fight, with each shared card counted against it.
  const cost = (c: { deck: BattleCard[]; rate: number }) => Math.abs(c.rate - COMPUTER_WIN_TARGET) + 0.03 * shared(c.deck);
  const ranked = candidates.map((deck) => ({ deck, rate: estimatePlayerWins(player, deck, 96, seed) })).sort((a, b) => cost(a) - cost(b));
  const finalists = ranked.slice(0, 6).map(({ deck }) => ({ deck, rate: estimatePlayerWins(player, deck, 512, seed ^ 0x9e3779b9) }));
  // Among the fair ones sharing fewest cards, lean either side of the target so the average lands on it.
  const fair = finalists.filter((c) => Math.abs(c.rate - COMPUTER_WIN_TARGET) < 0.045);
  const fewest = Math.min(...fair.map((c) => shared(c.deck)));
  const pick = fair.filter((c) => shared(c.deck) === fewest);
  const below = pick.filter((c) => c.rate <= COMPUTER_WIN_TARGET).sort((a, b) => b.rate - a.rate)[0];
  const above = pick.filter((c) => c.rate > COMPUTER_WIN_TARGET).sort((a, b) => a.rate - b.rate)[0];
  if (below && above) {
    const chanceOfAbove = (COMPUTER_WIN_TARGET - below.rate) / (above.rate - below.rate);
    return random() < chanceOfAbove ? above.deck : below.deck;
  }
  if (below || above) return (below ?? above).deck;
  finalists.sort((a, b) => cost(a) - cost(b));
  return finalists[0]?.deck ?? candidates[0];
}

/**
 * The five cards a win picks from, face down: the computer's own, with any
 * shop-only card (GTLM, TT, F1, MotoGP) swapped for one of the strongest Road
 * or Race cards. Those four series are only ever bought or spun for.
 */
export function prizesFor(opponent: BattleCard[], random: () => number = Math.random): BattleCard[] {
  const prizes = opponent.filter((c) => !c.bank);
  if (prizes.length === opponent.length) return prizes;
  const best = BRAND_CARDS.filter((c) => !prizes.some((p) => p.id === c.id))
    .map((c) => ({ c, s: fieldStrength(c, CATALOG) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.c);
  return [...prizes, ...shuffle(best, random).slice(0, opponent.length - prizes.length)];
}

export function createRun(player: BattleCard[], random: () => number = Math.random): BattleState {
  if (player.length !== 5 || new Set(player.map((c) => c.id)).size !== 5) throw new Error('Deck needs five unique cards');
  const opponent = createComputerDeck(player, random);
  const categories = shuffle([...CATEGORIES], random);
  const penaltyRound = random() < 0.125 ? 1 + Math.floor(random() * 4) : -1;
  const prizes = V2 ? prizesFor(opponent, random) : opponent;
  return {
    id: crypto.randomUUID(),
    player,
    opponent,
    hp: [Array(5).fill(100), Array(5).fill(100)],
    round: 0,
    categories,
    penaltyRound,
    usedTags: [],
    log: [],
    result: null,
    ...(V2 ? { prizes } : {}),
    rewardOrder: shuffle(prizes.map((c) => c.id), random),
    rewardClaimed: false,
  };
}

/**
 * Nobody can land a hit: every card still standing on one side ties with every
 * card standing on the other, in every category that can come up between them
 * (two copies of the same card, usually). Only an Overdrive can break that, so
 * with none left to arm the battle is a draw rather than rounds without end.
 */
export function deadlocked(state: BattleState): boolean {
  if (state.result) return false;
  const mine = state.player.filter((_, i) => state.hp[0][i] > 0);
  const theirs = state.opponent.filter((_, i) => state.hp[1][i] > 0);
  if (!mine.length || !theirs.length) return false;
  return mine.every((a) => theirs.every((b) => allowedFor(a, b).every((c) => a.ratings[c] === b.ratings[c])));
}

/**
 * One round. The player's card meets a random rival still standing, in a
 * random category; the higher rating wins and the other card takes the hit.
 * A dog tag armed for the round is used up whatever happens:
 *   Overdrive multiplies the player's rating;
 *   Pit medic gives the card HP back before the round;
 *   Second chance replays a lost round once in another category, with a
 *     rating bonus on the replay (first rule set: it just drew another
 *     category, which changed nothing the player could see).
 */
export function playRound(previous: BattleState, index: number, tag?: DogTag, random: () => number = Math.random): BattleState {
  if (previous.result || !previous.player[index] || previous.hp[0][index] <= 0) return previous;
  if (tag && previous.usedTags.includes(tag.id)) return previous;
  const s: BattleState = structuredClone(previous);
  const eligible = s.opponent.map((c, i) => ({ c, i })).filter((x) => s.hp[1][x.i] > 0);
  const rival = eligible[Math.floor(random() * eligible.length)];
  if (!rival) return { ...s, result: 'win' };
  const card = s.player[index];
  const allowed = allowedFor(card, rival.c);
  let category: Category = allowed[Math.floor(random() * allowed.length)];
  let first: Category | undefined;
  const event = rollEvent(random);
  const shown = (v: number) => Math.round(v * 10) / 10;

  if (event === 'rapture') {
    // Each side's strongest card still standing is beamed away; no round is fought.
    const best = (cards: BattleCard[], hp: number[]) =>
      cards.map((c, i) => ({ i, p: c.ratings.speed + c.ratings.g + c.ratings.distance + c.ratings.corners })).filter((x) => hp[x.i] > 0).sort((a, b) => b.p - a.p)[0]?.i ?? -1;
    const mine = best(s.player, s.hp[0]);
    const theirs = best(s.opponent, s.hp[1]);
    if (mine >= 0) s.hp[0][mine] = 0;
    if (theirs >= 0) s.hp[1][theirs] = 0;
    s.categories[s.round] = category;
    s.log.push({
      round: s.round + 1,
      category,
      player: card.id,
      opponent: rival.c.id,
      damage: 0,
      winner: null,
      event,
      raptured: [mine >= 0 ? s.player[mine].id : null, theirs >= 0 ? s.opponent[theirs].id : null],
    });
    s.round++;
    return finish(s);
  }

  // A gremlin jams the tag: no effect, not used up.
  const live = event === 'gremlin' ? undefined : tag;
  if (live) s.usedTags.push(live.id);
  if (event === 'pitstop') {
    for (const hp of s.hp) {
      const low = hp.map((v, i) => ({ v, i })).filter((x) => x.v > 0).sort((a, b) => a.v - b.v || a.i - b.i)[0];
      if (low) hp[low.i] = Math.min(100, hp[low.i] + EVENT_NUMBERS.pitHeal);
    }
  }
  if (live?.power === 'heal') s.hp[0][index] = Math.min(100, s.hp[0][index] + tagStrength(live, card));
  const boost = live?.power === 'boost' ? tagStrength(live, card) / 100 : 1;
  // Fresh tyres: the catalog's ratings, as new.
  const mineRatings = event === 'tyres' ? (CATALOG.find((c) => c.id === card.archetype)?.ratings ?? card.ratings) : card.ratings;
  const crowd = (id: string, side: 0 | 1) => (event === 'crowd' && s.log.some((l) => l.winner === side && (side === 0 ? l.player : l.opponent) === id) ? EVENT_NUMBERS.crowd : 1);
  const crowdMine = crowd(card.id, 0);
  const crowdTheirs = crowd(rival.c.id, 1);
  const score = (c: Category, replay = 1): [number, number] => {
    const rain = s.penaltyRound === s.round && c === 'lean' ? 0.8 : 1;
    return [mineRatings[c] * rain * boost * replay * crowdMine, rival.c.ratings[c] * rain * crowdTheirs];
  };
  let [a, b] = score(category);
  if (live?.power === 'reroll') {
    const others = allowed.filter((c) => c !== category);
    if (!V2) {
      category = others[Math.floor(random() * others.length)];
      [a, b] = score(category);
    } else if (a < b && others.length) {
      first = category;
      category = others[Math.floor(random() * others.length)];
      [a, b] = score(category, tagStrength(live, card) / 100);
    }
  }
  if (event === 'rain') {
    const mid = (a + b) / 2;
    a = mid + (a - mid) * 0.5;
    b = mid + (b - mid) * 0.5;
  }
  s.categories[s.round] = category;

  let winner: number | null = a === b ? null : a > b ? 0 : 1;
  let damage = damageFor(a, b);
  const floor = event === 'safety' ? 1 : 0;
  const hit = (side: number, i: number, d: number) => {
    const before = s.hp[side][i];
    s.hp[side][i] = Math.max(before > 0 ? floor : 0, before - d);
  };
  if (event === 'redflag') {
    winner = null;
    damage = 0;
    if (live) s.usedTags = s.usedTags.filter((id) => id !== live.id);
  } else if (event === 'photo' && a !== b && Math.abs(a - b) <= Math.max(a, b) * EVENT_NUMBERS.photoGap) {
    winner = null;
    damage = EVENT_NUMBERS.photoDamage;
    hit(0, index, damage);
    hit(1, rival.i, damage);
  } else {
    if (event === 'tailwind' && damage > 0) damage = Math.min(80, damage + EVENT_NUMBERS.tailwind);
    if (event === 'oil' && category === 'corners' && damage > 0) damage = Math.min(100, damage * 2);
    if (winner !== null) hit(1 - winner, winner === 0 ? rival.i : index, damage);
  }
  s.log.push({
    round: s.round + 1,
    category,
    player: card.id,
    opponent: rival.c.id,
    damage,
    winner,
    values: [shown(a), shown(b)],
    ...(first ? { first } : {}),
    ...(live ? { tag: live.power } : {}),
    ...(event ? { event } : {}),
  });
  s.round++;
  return finish(s);
}

function finish(s: BattleState): BattleState {
  if (s.hp.some((h) => h.every((v) => v === 0))) {
    const totals = s.hp.map((h) => h.reduce((x, y) => x + y, 0));
    s.result = totals[0] === totals[1] ? 'draw' : totals[0] > totals[1] ? 'win' : 'loss';
  }
  return s;
}

/** The player's card a rapture took this battle, if one did. */
export const rapturedOf = (run: BattleState): string | null => run.log.find((l) => l.raptured?.[0])?.raptured?.[0] ?? null;
