import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { collectedCardKey, type SharedCardPayload } from '../lib/cardCodec';

export interface CollectedCard extends SharedCardPayload {
  /** When this card was added to the local collection. */
  collectedAt: number;
  /** Stable key derived from payload identity. */
  key: string;
}

const STORAGE_KEY = 'bt.collected_cards.v1';

export function useCollectedCards() {
  const [collected, setCollected] = useLocalStorage<CollectedCard[]>(STORAGE_KEY, []);

  const addCard = useCallback(
    (payload: SharedCardPayload): { added: boolean; key: string } => {
      const key = collectedCardKey(payload);
      let added = false;
      setCollected((prev) => {
        const existingIdx = prev.findIndex((c) => c.key === key);
        const entry: CollectedCard = { ...payload, key, collectedAt: Date.now() };
        if (existingIdx >= 0) {
          // Update existing entry with latest stats / tier.
          const next = prev.slice();
          next[existingIdx] = { ...entry, collectedAt: prev[existingIdx].collectedAt };
          return next;
        }
        added = true;
        return [entry, ...prev];
      });
      return { added, key };
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

  return { collected, addCard, removeCard, clear };
}
