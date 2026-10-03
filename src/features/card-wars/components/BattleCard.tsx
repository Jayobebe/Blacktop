import { Bike, Car, Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { tr } from '@/lib/i18n';
import type { BattleCard as Card, Category } from '../types';
export function BattleCard({card,hp,selected,onSelect,disabled,category,faceDown=false}:{card:Card;hp?:number;selected?:boolean;onSelect?:()=>void;disabled?:boolean;category?:Category;faceDown?:boolean}){
 const Icon=faceDown?Ghost:card.vehicle==='bike'?Bike:Car;
 return <Button variant="outline" disabled={disabled} onClick={onSelect} aria-pressed={selected} aria-label={faceDown?tr('Choose face-down card'):card.name} className={`h-auto w-full min-w-0 flex-col items-stretch gap-2 p-3 rounded-lg whitespace-normal border ${selected?'border-accent bg-accent/10':'border-border'} ${hp===0?'opacity-40':''}`}>
 <div className="flex justify-between gap-1 text-[10px] text-muted-foreground"><span>{faceDown?'BLACKTOP':card.spec==='race'?tr('Race spec'):tr('Factory')}</span>{selected&&<span className="text-accent">✓</span>}</div>
 <div className="h-14 flex items-center justify-center text-accent"><Icon className="w-16 h-12" strokeWidth={1}/></div>
 <span className="min-h-10 text-xs font-semibold leading-5 text-foreground">{faceDown?'?':card.name}</span>
 {!faceDown&&category&&<span className="font-mono text-accent">{card.ratings[category]} / 100</span>}
 {hp!==undefined&&<div className="space-y-1"><Progress value={hp} className="h-1.5"/><span className="text-[10px] text-muted-foreground">{tr('{0} HP',[hp])}</span></div>}
 </Button>;
}
