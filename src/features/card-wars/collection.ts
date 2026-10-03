// Lightweight public collection API: never loads the battle screen or online play.
import { useMemo } from 'react';
import { CATALOG } from './lib/catalog';
import { useVault } from './lib/store';
export { BattleCard } from './components/BattleCard';

export function useWonBattleCards() {
  const { rewards } = useVault();
  return useMemo(() => rewards.flatMap(id => {
    const card = CATALOG.find(candidate => candidate.id === id);
    return card ? [{ ...card, source: 'reward' as const }] : [];
  }), [rewards]);
}