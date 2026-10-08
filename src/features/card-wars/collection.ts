// Lightweight public collection API: never loads the battle screen or online play.
import { useMemo } from 'react';
import { CATALOG, SHELVES, categoryOf } from './lib/catalog';
import { REDLINES, redlineById } from './lib/redline';
import { useVault } from './lib/store';
import type { BattleCard as Card } from './types';
export { CwCard as BattleCard } from './components/CwCard';
export { VaultTags } from './components/VaultTags';
export type { BattleCard as VaultBattleCard } from './types';

/** Every catalogue card, shelf by shelf, cheapest first: the vault's full list. */
const ALL: Card[] = SHELVES.flatMap((shelf) => CATALOG.filter((c) => categoryOf(c) === shelf).sort((a, b) => (a.price ?? 0) - (b.price ?? 0)));

/**
 * The battle cards the player holds: what the account owns (as the game last
 * heard from the server; the vault keeps a copy) and what's been won from the
 * computer on this phone. `all` is the whole catalogue, for the full list.
 */
export function useBattleCards(): { held: Card[]; all: Card[]; has: (id: string) => boolean } {
  const { rewards, owned } = useVault();
  return useMemo(() => {
    const ids = new Set([...(owned ?? []), ...rewards]);
    return { held: ALL.filter((c) => ids.has(c.id)), all: ALL, has: (id: string) => ids.has(id) };
  }, [rewards, owned]);
}

/** The Redline cards the player holds, and all there are. */
export function useRedlineCards(): { held: Card[]; all: Card[]; has: (id: string) => boolean } {
  const { redlines } = useVault();
  return useMemo(() => {
    const ids = new Set(redlines ?? []);
    return { held: (redlines ?? []).flatMap((id) => redlineById(id) ?? []), all: REDLINES, has: (id: string) => ids.has(id) };
  }, [redlines]);
}
