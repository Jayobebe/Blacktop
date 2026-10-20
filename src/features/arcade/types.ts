import type { LngLat } from './lib/gridlockGeo';

export type ArcadeGame = 'hit-heavy' | 'petrol-head' | 'gridlock';

export interface ArcadeScores {
  'hit-heavy': number;      // peak G (two decimal places stored as float)
  'petrol-head': number;    // seconds survived (integer)
  'gridlock': number;   // wins (integer)
}

export type GridlockState = 'lobby' | 'countdown' | 'live' | 'finished';

export interface GridlockArena {
  ring: LngLat[];
}

export interface GridlockLobby {
  id: string;
  code: string;
  leaderId: string;
  lives: number;
  arena: GridlockArena | null;
  state: GridlockState;
  winnerId: string | null;
  winnerName: string | null;
  startedAt: string | null;
  roundSeq: number;
}

export interface GridlockPlayer {
  id: string;
  userId: string;
  displayName: string;
  accentColor: string;
  isReady: boolean;
  livesLeft: number;
  isAlive: boolean;
  joinedAt: string;
}
