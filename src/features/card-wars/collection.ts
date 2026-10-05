// Lightweight public collection API: never loads the battle screen or online play.
import { useMemo } from 'react';
import { CATALOG } from './lib/catalog';
import { useVault } from './lib/store';
export { CwCard as BattleCard } from './components/CwCard';

/** Cards won from the computer on this phone, for the vault's "Won cards" row. */
export function useWonBattleCards() {
  const { rewards } = useVault();
  return useMemo(
    () =>
      rewards.flatMap((id) => {
        const card = CATALOG.find((candidate) => candidate.id === id);
        return card ? [{ ...card, source: 'reward' as const }] : [];
      }),
    [rewards],
  );
}
