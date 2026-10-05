/** The server's order (`cw_catalog.ratings`, the category numbers in a player battle's log). */
export const CATEGORIES = ['speed', 'lean', 'g', 'distance', 'corners'] as const;
export type Category = typeof CATEGORIES[number];
export type CardBank = 'gtlm' | 'f1' | 'tt' | 'motogp';
/** The server's order too: a dog tag is played as its power's index. */
export const POWERS = ['reroll', 'heal', 'boost', 'flip'] as const;
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

/** A Coin flip dog tag: heads is the card's best rating, tails its worst. */
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
  /** Coin flips that set the category: the player's, then the rival's. */
  flips?: [CoinFlip | null, CoinFlip | null];
  /** Something that happened before the category was drawn. */
  event?: import('./lib/events').RoundEvent;
  /** A rapture: the card each side lost to the beam (player, rival). */
  raptured?: [string | null, string | null];
}

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
}

/** What a finished battle against the computer did to the deck, waiting to reach the server. */
export interface WearReport {
  id: string;
  deck: string[];
  fought: string[];
  /** Rounds each card of `deck` fought, in its order (0: sat the battle out). */
  rounds?: number[];
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
}
