import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useDemoMode, DEMO_SPECTRE_CARDS } from '@/lib/demoMode';
import type { SharedCardPayload } from '../lib/cardCodec';

/**
 * Spectre cards (dog tags): ghost versions of a rider's card, earned only by
 * beating their Track Day record on a circuit (track_records). Unlike
 * collected cards they can't be scanned, shared or traded — there is no QR for
 * them — and they live in their own vault row. One per rider per board;
 * beating them again after they've improved keeps the best time. Spectres
 * from the old road time attacks stay in the vault.
 */
export interface SpectreCard {
  /** One per beaten rider and board (`track-<osm>-<dir>-<class>-<name>`), or the old road challenge's drop id. */
  key: string;
  card: SharedCardPayload;
  /** Locally cached vehicle photo (data URL). */
  img?: string;
  /** Rider whose time was beaten. */
  setterName: string;
  /** Where (the track layout); missing on Spectres from road time attacks. */
  track?: string;
  /** Winning time and the time that was beaten, seconds. */
  timeSec: number;
  targetSec: number;
  earnedAt: number;
}

export const SPECTRE_STORAGE_KEY = 'bt.spectre_cards.v1';

export function useSpectreCards() {
  const [realSpectres, setSpectres] = useLocalStorage<SpectreCard[]>(SPECTRE_STORAGE_KEY, []);
  // Demo mode shows the demo Spectre row; earning still writes the real one.
  const { enabled: demoEnabled } = useDemoMode();
  const spectres = demoEnabled ? DEMO_SPECTRE_CARDS : realSpectres;

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
