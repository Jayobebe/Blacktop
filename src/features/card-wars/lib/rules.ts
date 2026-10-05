/**
 * Card Wars rules, in numbers. The server settles everything that matters
 * (RPM, ownership, spins, player battles), so these only mirror what it does:
 * they drive the wording in the app and the battles against the computer.
 *
 * There are two sets. The first is what the server ran until migration
 * 20261009000000_card_wars_economy.sql; the second is what that migration
 * brings (prices and ratings that follow a card's strength, a daily limit on
 * battle rewards, staked player battles that pay out no more than went in, dog
 * tags that are won and tied to a vehicle). The app picks one when Card Wars
 * loads, from what the server said at launch, and keeps it until the next
 * launch: ratings, prices and wording never mix. Once the migration is live
 * everywhere, the first set and everything that reads `V2 ? … : …` can go.
 */
function serverRules(): 1 | 2 {
  // Scripts choose with CW_RULES (there's no server to ask).
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CW_RULES;
  if (env) return env === '2' ? 2 : 1;
  try {
    return JSON.parse(localStorage.getItem('bt.server_caps') || '{}').cardWars2 ? 2 : 1;
  } catch {
    return 1;
  }
}

export const V2 = serverRules() === 2;

/** What the server said at launch about a later migration (scripts: on with the second rule set). */
function serverHas(cap: 'cardWarsFlip' | 'cardWarsWear' | 'cardWarsPrizes' | 'cardWarsBuilds'): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CW_RULES;
  if (env) return env === '2';
  try {
    return !!JSON.parse(localStorage.getItem('bt.server_caps') || '{}')[cap];
  } catch {
    return false;
  }
}

/**
 * The server knows the Coin flip dog tag (the coin flip migration, applied as
 * 20261005174423_…; the `cardWarsFlip` cap). Without it the tag still works
 * against the computer, as the standard one everyone has: it just can't be
 * taken into a player battle or won on a spin.
 */
export const FLIP = V2 && serverHas('cardWarsFlip');

/**
 * Wear follows the rounds each card fought (migration
 * 20261011, applied as 20261005184020_…; the `cardWarsWear` cap). Until
 * the server has it, a battle costs a card that fought the flat `wear.road` /
 * `wear.race`, however often it was played.
 */
export const WEAR_BY_ROUND = V2 && serverHas('cardWarsWear');

/**
 * The prize table is the computer's own deck, shop-only cards included
 * (migration 20261012, applied as 20261005192322_…; the `cardWarsPrizes`
 * cap). Until the server has it, it only hands out Road and Race cards, so a
 * shop-only card on the table is swapped for one of those.
 */
export const PRIZE_DECK = V2 && serverHas('cardWarsPrizes');
/** A shop-only prize costs at most this many times the dearest card in the deck that won it (the server checks it against what the rider owns). */
export const PRIZE_REACH = 2;

/**
 * Migration 20261013000000_card_wars_builds.sql (the `cardWarsBuilds` cap):
 * a deck's three dog tags can share a power, a Spectre's tag has the power
 * spun for it and its bonus with any vehicle, repairs cost half as much, a
 * battle sat out gives 15 % back, and the other arcade games pay RPM.
 */
export const BUILDS = V2 && serverHas('cardWarsBuilds');
/** RPM for a finished game of Hit Heavy or Petrol Head (`best`: a new personal best), and the most a day pays. The server's numbers. */
export const ARCADE_PAY = { game: 5, best: 15, daily: 40 } as const;

export interface Rules {
  /** RPM for a finished battle against the computer. */
  reward: { win: number; draw: number; loss: number };
  /** Extra RPM for the first win of the day (0: none). */
  firstWin: number;
  /** Computer battles a day that pay RPM (null: no limit). */
  dailyBattles: number | null;
  /** RPM in place of a prize card that's already owned (0: nothing). */
  prizeDuplicate: number;
  /** Player battles: what each rider puts in, and what the winner takes. */
  stake: number;
  pot: number;
  /** What a paid spin lands, in percent. */
  odds: { card: number; tag: number; spin: number; rpm: number };
  /** Free spins a new player starts with. */
  freeCardSpins: number;
  freeTagSpins: number;
  /** Chance, in percent, that a free spin lands on each shelf. */
  freeOdds: { road: number; race: number; gtlm: number; tt: number; f1: number; motogp: number };
  /** Condition a card loses for a battle it fights in, and gains for one it sits out. */
  wear: { road: number; race: number; rest: number };
}

const RULES_V1: Rules = {
  reward: { win: 10, draw: 4, loss: 2 },
  firstWin: 0,
  dailyBattles: null,
  prizeDuplicate: 0,
  stake: 10,
  pot: 70,
  odds: { card: 20, tag: 0, spin: 25, rpm: 55 },
  freeCardSpins: 5,
  freeTagSpins: 0,
  freeOdds: { road: 50, race: 30, gtlm: 8, tt: 8, f1: 2, motogp: 2 },
  wear: { road: 8, race: 15, rest: 10 },
};

const RULES_V2: Rules = {
  reward: { win: 15, draw: 8, loss: 5 },
  firstWin: 20,
  dailyBattles: 20,
  prizeDuplicate: 10,
  stake: 20,
  pot: 36,
  odds: { card: 16, tag: 12, spin: 20, rpm: 52 },
  freeCardSpins: 5,
  freeTagSpins: FLIP ? 4 : 3,
  freeOdds: { road: 55, race: 30, gtlm: 6, tt: 6, f1: 1.5, motogp: 1.5 },
  wear: { road: 8, race: 15, rest: BUILDS ? 15 : 10 },
};

export const RULES: Rules = V2 ? RULES_V2 : RULES_V1;

/**
 * Wear by round: condition a card loses per round it fights (race builds
 * more), `extra` more for each round past its `past`-th in one battle, `cap` a
 * battle at most. A card played about as often as its deck mates (seven or
 * eight rounds of a battle's 38 or so) wears as it did under the flat rule;
 * one leaned on all battle wears two or three times as fast. Mirrored by
 * `cw_wear_loss` on the server.
 */
export const WEAR_ROUND = { road: 1, race: 2, past: 10, extra: 1, cap: 45 } as const;

/** Condition a card loses for the rounds it fought in one battle. */
export function wearLoss(race: boolean, rounds: number): number {
  if (rounds <= 0) return 0;
  if (!WEAR_BY_ROUND) return race ? RULES.wear.race : RULES.wear.road;
  return Math.min(WEAR_ROUND.cap, rounds * (race ? WEAR_ROUND.race : WEAR_ROUND.road) + Math.max(0, rounds - WEAR_ROUND.past) * WEAR_ROUND.extra);
}

/** RPM to bring a card back to 100% condition. Dearer cards cost more to run. */
export function repairCost(price: number | undefined, condition: number): number {
  const missing = Math.max(0, 100 - condition);
  if (missing === 0) return 0;
  return V2 ? Math.max(1, Math.ceil((missing * (price ?? 100)) / (BUILDS ? 400 : 200))) : missing;
}

/** Damage a lost round does: at least 20, more the wider the gap, 65 at most. */
export const damageFor = (a: number, b: number) => (a === b ? 0 : Math.min(65, 20 + Math.round(Math.abs(a - b) * 0.7)));
