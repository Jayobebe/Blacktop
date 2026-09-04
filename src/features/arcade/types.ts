import type { LngLat } from './lib/derezGeo';

export type ArcadeGame = 'hit-heavy' | 'petrol-head' | 'legacy-derez';

export interface ArcadeScores {
  'hit-heavy': number;      // peak G (two decimal places stored as float)
  'petrol-head': number;    // seconds survived (integer)
  'legacy-derez': number;   // wins (integer)
}

export type DerezState = 'lobby' | 'countdown' | 'live' | 'finished';

export interface DerezArena {
  ring: LngLat[];
}

export interface DerezLobby {
  id: string;
  code: string;
  leaderId: string;
  lives: number;
  arena: DerezArena | null;
  state: DerezState;
  winnerId: string | null;
  winnerName: string | null;
  startedAt: string | null;
  roundSeq: number;
}

export interface DerezPlayer {
  id: string;
  userId: string;
  displayName: string;
  accentColor: string;
  isReady: boolean;
  livesLeft: number;
  isAlive: boolean;
  joinedAt: string;
}
