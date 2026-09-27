import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { SharedCardPayload } from '../lib/cardCodec';

/**
 * Spectre cards: ghost versions of a rider's card, earned only by beating
 * their time attack. Unlike collected cards they can't be scanned, shared or
 * traded — there is no QR for them — and they live in their own vault row.
 * One per challenge (drop); beating it again keeps the best time.
 */
export interface SpectreCard {
  /** The challenge's card drop id. */
  key: string;
  card: SharedCardPayload;
  /** Locally cached vehicle photo (data URL). */
  img?: string;
  /** Rider who set the challenge. */
  setterName: string;
  /** Winning time and the time that was beaten, seconds. */
  timeSec: number;
  targetSec: number;
  earnedAt: number;
}

export const SPECTRE_STORAGE_KEY = 'bt.spectre_cards.v1';

export function useSpectreCards() {
  const [spectres, setSpectres] = useLocalStorage<SpectreCard[]>(SPECTRE_STORAGE_KEY, []);

  /** Returns 'new', 'improved' (faster than the stored win) or 'kept'. */
  const earnSpectre = useCallback(
    (entry: Omit<SpectreCard, 'earnedAt'>): 'new' | 'improved' | 'kept' => {
      let outcome: 'new' | 'improved' | 'kept' = 'new';
      setSpectres((prev) => {
        const existing = prev.find((s) => s.key === entry.key);
        if (!existing) return [{ ...entry, earnedAt: Date.now() }, ...prev];
        if (entry.timeSec >= existing.timeSec) {
          outcome = 'kept';
          return prev;
        }
        outcome = 'improved';
        return prev.map((s) =>
          s.key === entry.key ? { ...s, ...entry, img: entry.img ?? s.img, earnedAt: Date.now() } : s,
        );
      });
      return outcome;
    },
    [setSpectres],
  );

  return { spectres, earnSpectre };
}
