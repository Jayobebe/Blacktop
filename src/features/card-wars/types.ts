/** The server's order (`cw_catalog.ratings`, the category numbers in a player battle's log). */
export const CATEGORIES = ['speed', 'lean', 'g', 'distance', 'corners'] as const;
export type Category = typeof CATEGORIES[number];
export type CardBank = 'gtlm' | 'f1' | 'tt' | 'motogp';
/** The server's order too: a dog tag is played as its power's index. */
export const POWERS = ['reroll', 'heal', 'boost', 'flip', 'wild'] as const;
/** A deck carries three dog tags, each a different power: one of the four stays at home. */
export const TAG_SLOTS = 3;
export type TagPower = typeof POWERS[number];

export interface BattleCard {
  bank?: CardBank;
  /** RPM in the shop. */
  price?: number;
  id: string;
  name: string;
  manufacturer?: string;
  image?: string;
  tier?: import('@/features/cards/types').CardTier;
  /** A rider's own card: what the vehicle really is (its ratings are a catalog card's). */
  displayVehicle?: 'car' | 'bike';
  vehicle: 'car' | 'bike';
  spec: 'factory' | 'race';
  ratings: Record<Category, number>;
  /** The catalog card whose ratings this one battles with. */
  archetype: string;
  source?: 'relic' | 'collection' | 'unlock' | 'reward' | 'purchased';
  /** 0 to 100, set on cards outside a battle. */
  condition?: number;
  /** A Redline card (lib/redline.ts): never in a deck, it only fights from the Wildcard's wheel. */
  redline?: boolean;
}

export interface DogTag {
  id: string;
  name: string;
  power: TagPower;
  /** The kind of vehicle it does more with. The plain tags have none; a Spectre's (earned on track) has the bonus with any. */
  vehicle?: 'car' | 'bike' | 'any';
  /** A tag won on a spin: the catalog vehicle it's tied to, which sets how strong it is. */
  card?: string;
  /** A tag taken from a rider on a Track Day board. */
  spectre?: import('@/features/cards').SpectreCard;
}

/** A Coin flip dog tag: heads is the card's best category against the card it faces, tails its worst. */
export interface CoinFlip {
  heads: boolean;
  category: Category;
}

export interface RoundLog {
  round: number;
  category: Category;
  player: string;
  opponent: string;
  damage: number;
  winner: number | null;
  /** Second chance replayed the round: the category it was lost in first. */
  first?: Category;
  /** What was compared, after dog tags, wear and rain. */
  values?: [number, number];
  /** The dog tag the player armed. */
  tag?: TagPower;
  /** The dog tag the computer armed (hard only). */
  rivalTag?: TagPower;
  /** Coin flips that set the category: the player's, then the rival's. */
  flips?: [CoinFlip | null, CoinFlip | null];
  /** Something that happened before the category was drawn. */
  event?: import('./lib/events').RoundEvent;
  /** A rapture: the card each side lost to the beam (player, rival). */
  raptured?: [string | null, string | null];
  /** The Redline card the player's Wildcard landed on: it fought the round in `player`'s place. */
  wild?: string;
}

/** How hard the computer plays, and with it what a battle pays and wears. */
export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS_ORDER: Level[] = ['easy', 'medium', 'hard'];
/** Quick play: a theme is spun, a deck is built against the clock, and the battle has one twist. */
export type QuickMode = 'themed' | 'chaos' | 'sudden' | 'bare';
export const QUICK_MODES: QuickMode[] = ['themed', 'chaos', 'sudden', 'bare'];

export interface BattleState {
  id: string;
  player: BattleCard[];
  opponent: BattleCard[];
  hp: number[][];
  round: number;
  categories: Category[];
  penaltyRound: number;
  usedTags: string[];
  log: RoundLog[];
  result: 'win' | 'loss' | 'draw' | null;
  /** The cards a win picks from. Without it (older saved battles), the rival's deck. */
  prizes?: BattleCard[];
  rewardOrder: string[];
  rewardClaimed: boolean;
  rewardShuffleComplete?: boolean;
  chosenReward?: string;
  /** Battles from before levels have none: they played as medium does. */
  level?: Level;
  /** Quick play: the twist, and the category that comes up most. */
  mode?: QuickMode;
  theme?: Category;
  /** The daily challenge: the day it was (`dailyChallenge().day`). */
  daily?: string;
  /** Hard: the dog tags the computer has spent. */
  rivalUsed?: TagPower[];
  /** The player's Redline wheel as the battle began (the Wildcard lands on one of these). */
  wheel?: BattleCard[];
}

/** What a finished battle against the computer did to the deck, waiting to reach the server. */
export interface WearReport {
  id: string;
  deck: string[];
  fought: string[];
  /** Rounds each card of `deck` fought, in its order (0: sat the battle out). */
  rounds?: number[];
  /** The battle's level: easy and medium wear cards less. */
  level?: Level;
  /** The deck's card a rapture took: it comes home at full condition. */
  raptured?: string | null;
}

export interface VaultState {
  deck: string[];
  tags: string[];
  rewards: string[];
  run: BattleState | null;
  unlocks: string[];
  wear?: Record<string, number>;
  /** The deck as Card Wars last showed it (cards without their photos, dog tags, rating): what the Arcade page draws. */
  summary?: { cards: BattleCard[]; tags: DogTag[]; rating: number | null };
  wearQueue?: WearReport[];
  wearApplied?: string;
  rpmApplied?: string;
  /** Older saves kept one whole battle here; it's moved into `wearQueue` on load. */
  pendingWear?: BattleState;
  /** Raptured cards beaming back into the deck, shown once on the home screen. */
  beamIn?: string[];
  /** The Redline cards held, as the server last listed them: the vault shows them without opening the game. */
  redlines?: string[];
}
