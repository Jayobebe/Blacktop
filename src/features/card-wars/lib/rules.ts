/**
 * Card Wars rules, in numbers. The server settles everything that matters
 * (RPM, ownership, spins, player battles), so these only mirror what it does:
 * they drive the wording in the app and the battles against the computer.
 *
 * There is one rule set. The app used to carry the one before it too, and a
 * switch for each later migration, read from what the server said at launch;
 * every one of those migrations is live, so they're gone (2026-10-07).
 */

/** A shop-only prize costs at most this many times the dearest card in the deck that won it (the server checks it against what the rider owns). */
export const PRIZE_REACH = 2;

/** RPM for a finished game of Hit Heavy or Petrol Head (`best`: a new personal best), and the most a day pays. The server's numbers. */
export const ARCADE_PAY = { game: 5, best: 15, daily: 40 } as const;

/**
 * What each level is. `target`: the share of battles a player choosing cards
 * at random would win against the deck the computer is given. On hard the
 * computer also chooses its cards (`smart`: how often it plays its best pick
 * rather than a random one) and carries the three standard dog tags, so an
 * even deck is a real fight. `pay`: the share of the battle's RPM; `prize`: a
 * win picks a card; `wear`: the share of the rounds fought that count.
 * Mirrored by `cw_reward_battle`.
 */
export const LEVEL = {
  easy: { target: 0.72, smart: 0, tags: false, pay: 0, prize: false, wear: 1 / 3 },
  medium: { target: 0.6, smart: 0, tags: false, pay: 0.5, prize: false, wear: 2 / 3 },
  hard: { target: 0.52, smart: 0.75, tags: true, pay: 1, prize: true, wear: 1 },
} as const;
/** Quick play: how much of the time the spun theme is the category (the rest is the usual draw, which can land on it too), the seconds to build a deck, and each mode's twist. */
export const QUICK = { themeShare: 0.5, buildSeconds: 15, chaosEvents: 2, suddenHp: 60 } as const;
/** The rounds a card fought, as they count towards its wear at this level (none: battles from before levels, in full). */
export const levelRounds = (level: keyof typeof LEVEL | undefined, rounds: number): number => (rounds > 0 ? Math.max(1, Math.ceil(rounds * (level ? LEVEL[level].wear : 1))) : 0);
/** RPM a battle at `level` pays for a result (the first win of the day comes on top, on hard). */
export const levelPay = (level: keyof typeof LEVEL, result: 'win' | 'draw' | 'loss'): number => Math.ceil(RULES.reward[result] * LEVEL[level].pay);

/**
 * RPM never leaves an account: a swap is cards only, one for one, each for a
 * card of the same tier. A card can be held up to five times (a spin or prize
 * that lands on one already held is another copy; with five it pays a quarter
 * of its price); a deck takes each card once. Five cards of one tier trade up
 * for a spin at the next tier, and the Blacktop Marketplace buys a card on a
 * coin flip.
 */
/** Mirrors cw_market_rules(). */
export const COPIES = { most: 5 } as const;
export const MARKETPLACE = { low: 0.1, high: 0.5, daily: 3, keep: 5 } as const;
export const TRADE_UP = { cards: 5, keep: 5 } as const;
/** A win streak on hard: each win after the first adds `step` RPM, up to `most`. A hard loss or draw ends it. */
export const STREAK = { step: 2, most: 10 } as const;
/** The daily challenge: RPM for winning it, once a day. */
export const DAILY_PAY = 30;
const DAILY_THEMES = ['speed', 'corners', 'g', 'distance'] as const;
const DAILY_MODES = ['themed', 'chaos', 'sudden', 'bare'] as const;
/**
 * Today's challenge, the same for everyone: the day is the UTC date (as the
 * server counts it), and the theme and the twist follow from its number, all
 * sixteen pairs in turn.
 */
export function dailyChallenge(now: number = Date.now()) {
  const n = Math.floor(now / 86_400_000);
  return { day: String(n), theme: DAILY_THEMES[n % 4], mode: DAILY_MODES[(n + Math.floor(n / 4)) % 4] };
}

/**
 * RPM is shown ten times what the server counts: a bigger number, the same
 * economy. Every sum (prices, pay, balances, what the server sends) stays in
 * the server's units; a figure on screen goes through `showRpm`, and one typed
 * in comes back through `baseRpm`.
 */
export const RPM_SCALE = 10;
export const showRpm = (n: number): number => n * RPM_SCALE;
export const baseRpm = (shown: number): number => Math.floor(shown / RPM_SCALE);

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

export const RULES: Rules = {
  reward: { win: 15, draw: 8, loss: 5 },
  firstWin: 20,
  dailyBattles: 20,
  prizeDuplicate: 10,
  stake: 20,
  pot: 36,
  odds: { card: 16, tag: 12, spin: 20, rpm: 52 },
  freeCardSpins: 5,
  freeTagSpins: 4,
  freeOdds: { road: 55, race: 30, gtlm: 6, tt: 6, f1: 1.5, motogp: 1.5 },
  wear: { road: 8, race: 15, rest: 15 },
};

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
  return Math.min(WEAR_ROUND.cap, rounds * (race ? WEAR_ROUND.race : WEAR_ROUND.road) + Math.max(0, rounds - WEAR_ROUND.past) * WEAR_ROUND.extra);
}

/** RPM to bring a card back to 100% condition. Dearer cards cost more to run. */
export function repairCost(price: number | undefined, condition: number): number {
  const missing = Math.max(0, 100 - condition);
  if (missing === 0) return 0;
  return Math.max(1, Math.ceil((missing * (price ?? 100)) / 400));
}

/**
 * Damage a lost round does: a floor, more the wider the gap, up to a cap. It
 * was 20 / 0.7 a point / 65, and a battle ran about 35 rounds: long for a
 * phone. Now it's 35 / 0.8 / 80, about 24 rounds, and a wide gap still
 * takes two hits to knock a fresh card out. `cw_action` does the same sum.
 */
const envDamage = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CW_DAMAGE?.split(',').map(Number);
export const DAMAGE = envDamage?.length === 3 ? { floor: envDamage[0], gap: envDamage[1], cap: envDamage[2] } : { floor: 35, gap: 0.8, cap: 80 };
export const damageFor = (a: number, b: number) => (a === b ? 0 : Math.min(DAMAGE.cap, DAMAGE.floor + Math.round(Math.abs(a - b) * DAMAGE.gap)));
