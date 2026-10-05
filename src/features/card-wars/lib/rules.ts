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

/**
 * The server knows the Coin flip dog tag (migration
 * 20261010000000_card_wars_coin_flip.sql; the `cardWarsFlip` cap). Without it
 * the tag still works against the computer, as the standard one everyone has:
 * it just can't be taken into a player battle or won on a spin.
 */
function serverFlip(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CW_RULES;
  if (env) return env === '2';
  try {
    return !!JSON.parse(localStorage.getItem('bt.server_caps') || '{}').cardWarsFlip;
  } catch {
    return false;
  }
}
export const FLIP = V2 && serverFlip();

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
  wear: { road: 8, race: 15, rest: 10 },
};

export const RULES: Rules = V2 ? RULES_V2 : RULES_V1;

/** RPM to bring a card back to 100% condition. Dearer cards cost more to run. */
export function repairCost(price: number | undefined, condition: number): number {
  const missing = Math.max(0, 100 - condition);
  if (missing === 0) return 0;
  return V2 ? Math.max(1, Math.ceil((missing * (price ?? 100)) / 200)) : missing;
}

/** Damage a lost round does: at least 20, more the wider the gap, 65 at most. */
export const damageFor = (a: number, b: number) => (a === b ? 0 : Math.min(65, 20 + Math.round(Math.abs(a - b) * 0.7)));
