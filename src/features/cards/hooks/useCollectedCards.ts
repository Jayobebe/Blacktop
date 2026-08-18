import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { collectedCardKey, type SharedCardPayload } from '../lib/cardCodec';

export interface CollectedCard extends SharedCardPayload {
  /** When this card was added to the local collection. */
  collectedAt: number;
  /** Stable key derived from payload identity. */
  key: string;
  /** Locally cached vehicle photo (data URL) fetched at scan time. */
  img?: string;
}

const STORAGE_KEY = 'bt.collected_cards.v1';

export function useCollectedCards() {
  const [collected, setCollected] = useLocalStorage<CollectedCard[]>(STORAGE_KEY, []);

  const addCard = useCallback(
    (payload: SharedCardPayload, img?: string): { added: boolean; key: string } => {
      const key = collectedCardKey(payload);
      let added = false;
      setCollected((prev) => {
        if (prev.some((c) => c.key === key)) {
          // Card already in collection — stats frozen until user explicitly rescans.
          return prev;
        }
        added = true;
        return [{ ...payload, key, img, collectedAt: Date.now() }, ...prev];
      });
      return { added, key };
    },
    [setCollected],
  );

  // Explicit rescan: replaces a card's data at its existing slot, preserving collectedAt.
  const rescanCard = useCallback(
    (key: string, payload: SharedCardPayload, img?: string) => {
      setCollected((prev) => {
        const idx = prev.findIndex((c) => c.key === key);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = { ...payload, key, img: img ?? prev[idx].img, collectedAt: prev[idx].collectedAt };
        return next;
      });
    },
    [setCollected],
  );

  const removeCard = useCallback(
    (key: string) => {
      setCollected((prev) => prev.filter((c) => c.key !== key));
    },
    [setCollected],
  );

  const clear = useCallback(() => setCollected([]), [setCollected]);

  return { collected, addCard, rescanCard, removeCard, clear };
}
