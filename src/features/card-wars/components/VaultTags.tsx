import { Lock } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useServerCap } from '@/lib/serverCaps';
import { WILD_TAG, wildTag } from '../lib/redline';
import { useVault } from '../lib/store';
import { vehicleTag } from '../lib/tagRules';
import { WILD_COMBOS, type BattleCard, type DogTag } from '../types';
import { DogTagPlate } from './DogTagPlate';

/**
 * The dog tags that go with a card, in the vault: the four tied to that
 * vehicle (a Redline card's are the Wildcard and the four combos of its own
 * kind: car versions under a car, bike versions under a bike), each as it is when held and greyed, but still readable, when
 * it isn't.
 */
export function VaultTags({ card }: { card: BattleCard }) {
  const { ownedTags = [], wildcard, wildTags = [] } = useVault();
  const combos = useServerCap('cardWarsCombos');
  const tags: { tag: DogTag; held: boolean }[] = card.redline
    ? [
        { tag: WILD_TAG, held: !!wildcard },
        ...(combos ? WILD_COMBOS.map((combo) => ({ tag: wildTag(combo, card.vehicle), held: !!wildcard && wildTags.includes(`${combo}.${card.vehicle}`) })) : []),
      ]
    : (['boost', 'heal', 'reroll', 'flip'] as const).flatMap((power) => {
        const tag = vehicleTag(power, card.id);
        return tag ? [{ tag, held: ownedTags.includes(`${power}:${card.id}`) }] : [];
      });
  if (!tags.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">{tr("Its dog tags")}</p>
      {tags.map(({ tag, held }) => (
        <DogTagPlate key={tag.id} tag={tag} className={cn('w-full', !held && 'vault-locked')}>
          {!held && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest">
              <Lock className="w-2.5 h-2.5" aria-hidden />
              {tr("Locked")}
            </span>
          )}
        </DogTagPlate>
      ))}
    </div>
  );
}
