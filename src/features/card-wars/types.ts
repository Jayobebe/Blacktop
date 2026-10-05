/** The server's order (`cw_catalog.ratings`, the category numbers in a player battle's log). */
export const CATEGORIES = ['speed', 'lean', 'g', 'distance', 'corners'] as const;
export type Category = typeof CATEGORIES[number];
export type CardBank = 'gtlm' | 'f1' | 'tt' | 'motogp';
/** The server's order too: a dog tag is played as its power's index. */
export const POWERS = ['reroll', 'heal', 'boost'] as const;
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
  /** The kind of vehicle it does more with. The plain tags have none. */
  vehicle?: 'car' | 'bike';
  /** A tag won on a spin: the catalog vehicle it's tied to, which sets how strong it is. */
  card?: string;
  /** A tag taken from a rider on a Track Day board. */
  spectre?: import('@/features/cards').SpectreCard;
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
}

export interface VaultState {
  deck: string[];
  tags: string[];
  rewards: string[];
  run: BattleState | null;
  unlocks: string[];
  wear?: Record<string, number>;
  wearQueue?: WearReport[];
  wearApplied?: string;
  rpmApplied?: string;
  /** Older saves kept one whole battle here; it's moved into `wearQueue` on load. */
  pendingWear?: BattleState;
}
