import { Bike, Car, Ghost, Check, Gauge, Route, Zap, CornerUpRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { tr } from '@/lib/i18n';
import garageShopAsset from '@/assets/garage-shop.png.asset.json';
import { TIER_STYLES } from '@/features/cards/types';
import type { BattleCard as Card, Category } from '../types';
import '../card-wars.css';
const STATS: { key: Category; label: string; icon: typeof Gauge }[] = [
 {key:'speed',label:'Speed',icon:Gauge}, {key:'lean',label:'Lean',icon:RotateCw},
 {key:'g',label:'G-force',icon:Zap}, {key:'distance',label:'Distance',icon:Route},
 {key:'corners',label:'Corners',icon:CornerUpRight},
];
export function BattleCard({card,hp,selected,onSelect,disabled,category,faceDown=false,readOnly=false}:{card:Card;hp?:number;selected?:boolean;onSelect?:()=>void;disabled?:boolean;category?:Category;faceDown?:boolean;readOnly?:boolean}){
 const vehicle=card.displayVehicle ?? card.vehicle;
 const Icon=vehicle==='bike'?Bike:Car;
 const stats=STATS.filter(s=>s.key!=='lean'||(vehicle==='bike' && (card.source!=='collection'||card.displayVehicle==='bike')));
 const frame=TIER_STYLES[card.tier ?? 'locked'];
 const content=faceDown ? <div className="cw-card-back"><span className="text-xs font-bold text-accent">BLACKTOP</span><Ghost className="w-16 h-16 text-accent" strokeWidth={1}/><span className="text-xs font-semibold text-foreground">{tr('Card Wars')}</span></div> : <>
  <div className="flex items-center justify-between gap-1 text-[9px] text-muted-foreground uppercase">
   <span className="truncate">{tr(card.source==='relic'?'Relic':card.spec==='race'?'Race spec':'Factory')}</span>
   {selected ? <Check className="w-3 h-3 shrink-0 text-accent"/> : <Icon className="w-3 h-3 shrink-0 text-accent"/>}
  </div>
  <span className="cw-card-name text-foreground">{card.name}</span>
  <div className="cw-card-art border border-border/60 rounded-md">
   <img src={garageShopAsset.url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60"/>
   {card.image ? <img src={card.image} alt={card.name} className="relative w-full h-full object-contain p-1"/> : <Icon className="relative w-3/4 h-3/4 text-muted-foreground" strokeWidth={0.7}/>}
  </div>
  <div className="cw-card-stats">
   {stats.map(s=>{const StatIcon=s.icon;return <div key={s.key} className={`flex items-center justify-between gap-1 border-b border-border/40 py-1 ${category===s.key?'text-accent':'text-muted-foreground'}`}><span className="flex items-center gap-1 min-w-0"><StatIcon className="w-3 h-3 shrink-0"/><span>{tr(s.label)}</span></span><strong className="font-mono text-foreground">{card.ratings[s.key]}</strong></div>;})}
  </div>
  <div className="cw-card-footer border-t border-border/60 pt-1.5">
   <span className="block text-[10px] font-semibold text-accent truncate">{card.manufacturer || '—'}</span>
   {hp!==undefined ? <div className="mt-1 space-y-1"><Progress value={hp} className="h-1"/><span className="block text-[9px] text-muted-foreground">{tr('{0} HP',[hp])}</span></div> : <span className="block text-[8px] text-muted-foreground mt-1">BLACKTOP · {tr('Card Wars')}</span>}
  </div>
 </>;
 const className=`cw-trading-card no-frost h-auto w-full min-w-0 flex flex-col items-stretch justify-start p-2.5 rounded-lg whitespace-normal border-2 text-left ${selected?'border-accent':frame.border} ${hp===0?'opacity-40':''}`;
 return readOnly ? <div className={className}>{content}</div> : <Button variant="outline" disabled={disabled} onClick={onSelect} aria-pressed={selected} aria-label={faceDown?tr('Choose face-down card'):`${card.manufacturer || ''} ${card.name}`.trim()} className={className}>{content}</Button>;
}
