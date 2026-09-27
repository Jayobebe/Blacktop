import type { Lap } from '../types';

export type SectorTone = 'best' | 'better' | 'slower' | 'none';

/** Purple = best of the session, green = faster than last lap, yellow = slower. */
export function sectorTone(ms: number | undefined, index: number, bestBefore: number[], lastLap: Lap | null): SectorTone {
  if (ms == null) return 'none';
  const best = bestBefore[index];
  if (best == null || !Number.isFinite(best) || ms <= best) return 'best';
  const prev = lastLap?.sectors[index];
  if (prev != null && ms < prev) return 'better';
  return 'slower';
}

export function theoreticalBest(laps: Lap[], sectors: number): number | null {
  const valid = laps.filter((l) => l.valid && l.sectors.length === sectors);
  if (!valid.length) return null;
  let total = 0;
  for (let i = 0; i < sectors; i++) total += Math.min(...valid.map((l) => l.sectors[i]));
  return total;
}

