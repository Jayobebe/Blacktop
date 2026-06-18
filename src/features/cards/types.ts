export type CardTier =
  | 'locked'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'ruby'
  | 'obsidian'
  | 'polyatomic'
  | 'orion';

export interface TierDef {
  id: CardTier;
  label: string;
  minRides: number;
}

/** Ride-count thresholds, ordered ascending. */
export const TIER_LADDER: TierDef[] = [
  { id: 'locked', label: 'Locked', minRides: 0 },
  { id: 'bronze', label: 'Bronze', minRides: 10 },
  { id: 'silver', label: 'Silver', minRides: 25 },
  { id: 'gold', label: 'Gold', minRides: 50 },
  { id: 'platinum', label: 'Platinum', minRides: 100 },
  { id: 'diamond', label: 'Diamond', minRides: 200 },
  { id: 'ruby', label: 'Ruby', minRides: 300 },
  { id: 'obsidian', label: 'Obsidian', minRides: 400 },
  { id: 'polyatomic', label: 'Polyatomic', minRides: 500 },
  { id: 'orion', label: 'Orion', minRides: 1000 },
];

/**
 * Tailwind class fragments per tier. Built around CSS variables / neutral
 * gradients so the card never collides with the user's chosen accent color.
 */
export interface TierStyle {
  /** Card background gradient. */
  bg: string;
  /** Card outer border color. */
  border: string;
  /** Tier chip background + text. */
  chip: string;
  /** Whether the slow shine sweep should run. */
  shine: boolean;
  /** Whether to render the sparkle/star overlay. */
  sparkle: boolean;
}

export const TIER_STYLES: Record<CardTier, TierStyle> = {
  locked: {
    bg: 'bg-gradient-to-br from-secondary/40 to-card/60',
    border: 'border-border/40',
    chip: 'bg-muted/60 text-muted-foreground',
    shine: false,
    sparkle: false,
  },
  bronze: {
    bg: 'bg-gradient-to-br from-[hsl(24_55%_32%)] via-[hsl(22_60%_42%)] to-[hsl(18_50%_22%)]',
    border: 'border-[hsl(22_60%_50%)]/60',
    chip: 'bg-[hsl(22_60%_25%)]/80 text-[hsl(28_80%_82%)]',
    shine: false,
    sparkle: false,
  },
  silver: {
    bg: 'bg-gradient-to-br from-[hsl(220_8%_72%)] via-[hsl(220_6%_55%)] to-[hsl(220_10%_30%)]',
    border: 'border-[hsl(220_8%_78%)]/60',
    chip: 'bg-[hsl(220_8%_22%)]/80 text-[hsl(220_10%_92%)]',
    shine: true,
    sparkle: false,
  },
  gold: {
    bg: 'bg-gradient-to-br from-[hsl(45_85%_60%)] via-[hsl(40_80%_45%)] to-[hsl(35_70%_25%)]',
    border: 'border-[hsl(45_85%_65%)]/70',
    chip: 'bg-[hsl(35_70%_18%)]/85 text-[hsl(45_90%_85%)]',
    shine: true,
    sparkle: false,
  },
  platinum: {
    bg: 'bg-gradient-to-br from-[hsl(200_15%_88%)] via-[hsl(210_12%_70%)] to-[hsl(215_18%_38%)]',
    border: 'border-[hsl(200_20%_92%)]/70',
    chip: 'bg-[hsl(215_18%_20%)]/80 text-[hsl(200_20%_94%)]',
    shine: true,
    sparkle: false,
  },
  diamond: {
    bg: 'bg-gradient-to-br from-[hsl(190_85%_82%)] via-[hsl(195_70%_60%)] to-[hsl(210_55%_28%)]',
    border: 'border-[hsl(190_90%_85%)]/70',
    chip: 'bg-[hsl(210_55%_18%)]/85 text-[hsl(190_90%_90%)]',
    shine: true,
    sparkle: true,
  },
  ruby: {
    bg: 'bg-gradient-to-br from-[hsl(350_75%_55%)] via-[hsl(348_70%_38%)] to-[hsl(345_65%_18%)]',
    border: 'border-[hsl(350_80%_60%)]/70',
    chip: 'bg-[hsl(345_65%_15%)]/85 text-[hsl(350_85%_88%)]',
    shine: true,
    sparkle: false,
  },
  obsidian: {
    bg: 'bg-gradient-to-br from-[hsl(220_15%_12%)] via-[hsl(220_15%_6%)] to-[hsl(0_0%_0%)]',
    border: 'border-accent/60',
    chip: 'bg-black/70 text-accent',
    shine: false,
    sparkle: true,
  },
  polyatomic: {
    bg: 'bg-[conic-gradient(from_120deg_at_50%_50%,hsl(280_80%_55%),hsl(195_85%_60%),hsl(45_90%_60%),hsl(330_80%_60%),hsl(280_80%_55%))]',
    border: 'border-white/40',
    chip: 'bg-black/60 text-white',
    shine: true,
    sparkle: true,
  },
  orion: {
    bg: 'bg-gradient-to-br from-[hsl(230_50%_18%)] via-[hsl(260_55%_12%)] to-[hsl(220_60%_4%)]',
    border: 'border-accent/70',
    chip: 'bg-black/70 text-accent',
    shine: true,
    sparkle: true,
  },
};

export interface VehicleCardSnapshot {
  lastTier: CardTier;
  /** Highest tier the user has actually seen the reveal for. */
  lastSeenTier: CardTier;
  topSpeedMph: number;
  maxLean: number;
  totalDistanceKm: number;
  totalRides: number;
  totalDurationSec: number;
}

export type CardSnapshots = Record<string, VehicleCardSnapshot>;

export const CARDS_STORAGE_KEY = 'bt.cards.v1';
