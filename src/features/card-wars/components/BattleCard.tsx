import { Ghost, Check, Gauge, Route, Zap, CornerUpRight, RotateCw, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import { VaultCardFace } from '@/features/cards';
import { ScaledCardFace } from './ScaledCardFace';
import { BANK_INFO, CATALOG } from '../lib/catalog';
import { TIER_STYLES } from '@/features/cards/types';
import type { BattleCard as Card, Category } from '../types';
import '../card-wars.css';
const STATS = [
 {key:'speed' as const,label:'Speed',icon:Gauge}, {key:'distance' as const,label:'Distance',icon:Route},
 {key:'corners' as const,label:'Corners',icon:CornerUpRight}, {key:'g' as const,label:'G-force',icon:Zap},
 {key:'lean' as const,label:'Lean',icon:RotateCw},
];
export function BattleCard({card,hp,selected,onSelect,disabled,category,compareTo,faceDown=false,readOnly=false,showCondition=false}:{showCondition?:boolean;card:Card;hp?:number;selected?:boolean;onSelect?:()=>void;disabled?:boolean;category?:Category;compareTo?:Card;faceDown?:boolean;readOnly?:boolean}){
 const vehicle=card.displayVehicle ?? card.vehicle;
 const stats=STATS.filter(s=>s.key!=='lean'||(vehicle==='bike' && (card.source!=='collection'||card.displayVehicle==='bike')));
 const tier=card.tier ?? (card.spec==='race'?'ruby':'silver');
 const frame=TIER_STYLES[tier];
 // Saved runs keep their ratings and identities, but can pick up newly supplied artwork.
 const image=card.image ?? (card.source==='collection'?undefined:CATALOG.find(c=>c.id===card.id)?.image);
  const content=faceDown ? <div className="cw-card-back"><span>BLACKTOP</span><Ghost strokeWidth={1}/><span>{tr('Card Wars')}</span></div> : <ScaledCardFace><VaultCardFace card={{v:1,i:card.id,key:card.id,collectedAt:0,ts:0,n:card.name,o:card.manufacturer||'—',m:card.bank?BANK_INFO[card.bank].label:tr(card.spec==='race'?'Race spec':'Factory'),t:tier,tl:tr(tier.charAt(0).toUpperCase()+tier.slice(1)),img:image,s:{totalRides:0,totalDistanceMi:0,totalDurationSec:0,topSpeedMph:null,maxLean:null,maxGForce:null}}} stats={<div className="cw-vault-ratings">{stats.map(s=>{const StatIcon=s.icon;const comparable=compareTo&&(s.key!=='lean'||(compareTo.displayVehicle??compareTo.vehicle)==='bike');const delta=comparable?card.ratings[s.key]-compareTo.ratings[s.key]:null;const Arrow=delta===null?null:delta>0?ArrowUp:delta<0?ArrowDown:Minus;return <div key={s.key} className={`cw-vault-stat ${category===s.key?'cw-stat-active':''}`}><span><StatIcon/>{tr(s.label)}</span><strong className="font-mono">{card.ratings[s.key]}<small>/100</small>{Arrow&&<Arrow className={`cw-stat-change ${delta&&delta>0?'cw-stat-better':delta&&delta<0?'cw-stat-worse':'cw-stat-equal'}`} aria-label={tr(delta&&delta>0?'Higher':delta&&delta<0?'Lower':'Equal')}/>}</strong></div>;})}</div>}/></ScaledCardFace>;
 const className=`cw-trading-card cw-tier-${tier} no-frost ${frame.bg} ${selected?'cw-card-selected':''} ${hp===0?'cw-knocked-out':''}`;
 return <div className="cw-card-slot">{readOnly ? <div className={className}>{content}</div> : <Button variant="ghost" disabled={disabled} onClick={onSelect} aria-pressed={selected} aria-label={faceDown?tr('Choose face-down card'):`${card.manufacturer||''} ${card.name}`.trim()} className={className}>{content}{selected&&!faceDown&&<Check className="cw-card-check"/>}</Button>}{showCondition&&card.condition!==undefined&&<div className="cw-health cw-condition"><div role="progressbar" aria-label={tr('{0} condition',[card.name])} aria-valuenow={card.condition} aria-valuemin={0} aria-valuemax={100} className="cw-health-track"><div className={card.condition<50?'cw-health-low':'cw-condition-fill'} style={{width:`${card.condition}%`}}/></div><span className="font-mono">{tr('{0}% condition',[card.condition])}</span></div>}{hp!==undefined&&!(showCondition&&card.condition!==undefined)&&<div className="cw-health"><div role="progressbar" aria-label={tr('{0} health',[card.name])} aria-valuenow={hp} aria-valuemin={0} aria-valuemax={100} className="cw-health-track"><div className={hp<=30?'cw-health-low':'cw-health-fill'} style={{width:`${hp}%`}}/></div><span className="font-mono">{tr('{0} HP',[hp])}</span></div>}</div>;
}
