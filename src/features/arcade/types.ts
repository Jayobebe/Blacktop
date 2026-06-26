export type ArcadeGame = 'hit-heavy' | 'petrol-head';

export interface ArcadeScores {
  'hit-heavy': number;   // peak G (two decimal places stored as float)
  'petrol-head': number; // seconds survived (integer)
}
