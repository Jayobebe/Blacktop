import { Shuffle, Heart, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VaultCardFace } from '@/features/cards';
import { tr } from '@/lib/i18n';
import { ScaledCardFace } from './ScaledCardFace';
import type { DogTag } from '../types';
const POWERS = { reroll: Shuffle, heal: Heart, boost: Zap };
export function BattleDogTag({tag,selected,disabled,used,onSelect}:{tag:DogTag;selected:boolean;disabled:boolean;used:boolean;onSelect:()=>void}) {
 const Icon=POWERS[tag.power];
 const card=tag.spectre ? {...tag.spectre.card,key:tag.spectre.key,collectedAt:tag.spectre.earnedAt,img:tag.spectre.img} : {v:1 as const,i:tag.id,key:tag.id,collectedAt:0,ts:0,n:tr(tag.name),o:'Blacktop',m:tr('Spectre'),t:'silver' as const,tl:tr('Spectre'),s:{totalRides:0,totalDistanceMi:0,totalDurationSec:0,topSpeedMph:null,maxLean:null,maxGForce:null}};
 const spectre=tag.spectre ?? {key:tag.id,card,setterName:tag.name,timeSec:0,targetSec:0,earnedAt:0};
 return <Button variant="ghost" className={`cw-dog-tag ${selected?'cw-dog-tag-selected':''} ${used?'cw-dog-tag-used':''}`} disabled={disabled||used} onClick={onSelect} aria-label={tr(tag.name)} aria-pressed={selected} title={tr(tag.name)}>
  <ScaledCardFace><VaultCardFace card={card} spectre={spectre}/></ScaledCardFace>
  <span className="cw-dog-power">{selected?<Check/>:<Icon/>}</span>
 </Button>;
}
