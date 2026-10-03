import { Bike, Car, Ghost, Check, Gauge, Route, Zap, CornerUpRight, RotateCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import garageShopAsset from '@/assets/garage-shop.png.asset.json';
import { TIER_STYLES } from '@/features/cards/types';
import type { BattleCard as Card, Category } from '../types';
import '../card-wars.css';
const STATS = [
 {key:'speed' as const,label:'Speed',icon:Gauge}, {key:'distance' as const,label:'Distance',icon:Route},
 {key:'corners' as const,label:'Corners',icon:CornerUpRight}, {key:'g' as const,label:'G-force',icon:Zap},
 {key:'lean' as const,label:'Lean',icon:RotateCw},
];
export function BattleCard({card,hp,selected,onSelect,disabled,category,faceDown=false,readOnly=false}:{card:Card;hp?:number;selected?:boolean;onSelect?:()=>void;disabled?:boolean;category?:Category;faceDown?:boolean;readOnly?:boolean}){
 const vehicle=card.displayVehicle ?? card.vehicle;
 const Icon=vehicle==='bike'?Bike:Car;
 const stats=STATS.filter(s=>s.key!=='lean'||(vehicle==='bike' && (card.source!=='collection'||card.displayVehicle==='bike')));
 const tier=card.source==='collection' && card.tier ? card.tier : card.spec==='race'?'ruby':'silver';
 const frame=TIER_STYLES[tier];
 const content=faceDown ? <div className="cw-card-back"><span>BLACKTOP</span><Ghost strokeWidth={1}/><span>{tr('Card Wars')}</span></div> : <>
  {frame.shine&&<div className="cw-card-sheen"/>}
  <div className="cw-card-heading"><div className="min-w-0"><span className="cw-card-name">{card.name}</span><span className="cw-card-make">{card.manufacturer||'—'}</span></div><span className={`cw-tier ${frame.chip}`}><Sparkles/>{tr(tier==='silver'?'Silver':tier==='ruby'?'Ruby':tier.charAt(0).toUpperCase()+tier.slice(1))}</span></div>
  <div className="cw-card-art"><img onError={e=>{e.currentTarget.hidden=true;}} src={garageShopAsset.url} alt="" className="absolute inset-0 w-full h-full object-cover"/>{card.image ? <img onError={e=>{e.currentTarget.hidden=true;}} src={card.image} alt={card.name} className="relative w-full h-full object-contain p-1"/> : <Icon className="relative w-3/4 h-3/4 text-foreground/70" strokeWidth={.7}/>}</div>
  <div className="cw-card-stats">{stats.map(s=>{const StatIcon=s.icon;return <div key={s.key} className={`cw-stat ${category===s.key?'cw-stat-active':''}`}><span><StatIcon/>{tr(s.label)}</span><strong className="font-mono">{card.ratings[s.key]}<small>/100</small></strong></div>;})}</div>
  <div className="cw-card-footer"><span>{tr(card.spec==='race'?'Race spec':'Factory')}</span>{selected?<Check/>:<span>BLACKTOP</span>}</div>
 </>;
 const className=`cw-trading-card cw-tier-${tier} no-frost ${frame.bg} ${selected?'border-accent':frame.border} ${hp===0?'cw-knocked-out':''}`;
 return <div className="cw-card-slot">{readOnly ? <div className={className}>{content}</div> : <Button variant="ghost" disabled={disabled} onClick={onSelect} aria-pressed={selected} aria-label={faceDown?tr('Choose face-down card'):`${card.manufacturer||''} ${card.name}`.trim()} className={className}>{content}</Button>}{hp!==undefined&&<div className="cw-health"><div role="progressbar" aria-label={tr('{0} health',[card.name])} aria-valuenow={hp} aria-valuemin={0} aria-valuemax={100} className="cw-health-track"><div className={hp<=30?'cw-health-low':'cw-health-fill'} style={{width:`${hp}%`}}/></div><span className="font-mono">{tr('{0} HP',[hp])}</span></div>}</div>;
}
