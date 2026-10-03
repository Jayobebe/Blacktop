import { Ghost, Shuffle, Heart, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VaultCardFace } from '@/features/cards';
import { tr } from '@/lib/i18n';
import type { DogTag } from '../types';
const POWERS = { reroll: Shuffle, heal: Heart, boost: Zap };
export function BattleDogTag({tag,selected,disabled,used,onSelect}:{tag:DogTag;selected:boolean;disabled:boolean;used:boolean;onSelect:()=>void}) {
 const Icon=POWERS[tag.power];
 return <Button variant="ghost" className={`cw-dog-tag ${selected?'cw-dog-tag-selected':''} ${used?'cw-dog-tag-used':''}`} disabled={disabled||used} onClick={onSelect} aria-label={tr(tag.name)} aria-pressed={selected} title={tr(tag.name)}>
  {tag.spectre ? <VaultCardFace card={{...tag.spectre.card,key:tag.spectre.key,collectedAt:tag.spectre.earnedAt,img:tag.spectre.img}} spectre={tag.spectre}/> : <div className="spectre-card cw-starter-spectre"><div className="spectre-metal"/><div className="spectre-fog"/><div className="spectre-fog alt"/><div className="spectre-shimmer"/><span>{tr('Spectre')}</span><Ghost/><strong>{tr(tag.name)}</strong></div>}
  <span className="cw-dog-power">{selected?<Check/>:<Icon/>}</span>
 </Button>;
}
