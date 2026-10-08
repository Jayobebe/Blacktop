import { Lock } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { WILD_TAG } from '../lib/redline';
import { useVault } from '../lib/store';
import { vehicleTag } from '../lib/tagRules';
import type { BattleCard, DogTag } from '../types';
import { DogTagPlate } from './DogTagPlate';

/**
 * The dog tags that go with a card, in the vault: the four tied to that
 * vehicle (a Redline card's is the Wildcard), each as it is when held and
 * greyed, but still readable, when it isn't.
 */
export function VaultTags({ card }: { card: BattleCard }) {
  const { ownedTags = [], wildcard } = useVault();
  const tags: { tag: DogTag; held: boolean }[] = card.redline
    ? [{ tag: WILD_TAG, held: !!wildcard }]
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
