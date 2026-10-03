export const CATEGORIES = ['speed', 'lean', 'g', 'distance', 'corners'] as const;
export type Category = typeof CATEGORIES[number];
export interface BattleCard { id: string; name: string; vehicle: 'car' | 'bike'; spec: 'factory' | 'race'; ratings: Record<Category, number>; archetype: string; source?: 'relic' | 'collection' | 'unlock' | 'reward' }
export interface DogTag { id: string; name: string; power: 'reroll' | 'heal' | 'boost'; vehicle: 'car' | 'bike' }
export interface BattleState { id: string; player: BattleCard[]; opponent: BattleCard[]; hp: number[][]; round: number; categories: Category[]; penaltyRound: number; usedTags: string[]; log: { round: number; category: Category; player: string; opponent: string; damage: number; winner: number | null }[]; result: 'win' | 'loss' | 'draw' | null; rewardOrder: string[]; rewardClaimed: boolean }
export interface VaultState { deck: string[]; tags: string[]; rewards: string[]; run: BattleState | null; unlocks: string[] }
