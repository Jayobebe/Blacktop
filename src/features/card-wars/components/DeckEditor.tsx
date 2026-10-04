import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { tr } from '@/lib/i18n';
import { BattleCard } from './BattleCard';
import { BattleDogTag } from './BattleDogTag';
import { FittedHand } from './FittedHand';
import type { BattleCard as Card, DogTag } from '../types';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';
import { spin, useShop, type SpinResult } from '../lib/shop';
import { SpinReel } from './SpinReel';
import { spinLabel, REEL_LABELS } from './ShopPage';

const POWER_LABELS = { reroll:'Second chance', heal:'Pit medic', boost:'Overdrive' };
export function DeckEditor({deck,tags,pool,availableTags,disabled,onReplace}:{deck:Card[];tags:DogTag[];pool:Card[];availableTags:DogTag[];disabled:boolean;onReplace:(type:'deck'|'tags',index:number,id:string)=>void}) {
 const [slot,setSlot]=useState<{type:'deck'|'tags';index:number}|null>(null);
 const shop=useShop();const [spinSlot,setSpinSlot]=useState<number|null>(null);const [spinning,setSpinning]=useState(false);const [result,setResult]=useState<SpinResult|null>(null);
 const unused=pool.filter(c=>!deck.some(x=>x.id===c.id));
 function openEmpty(i:number){if(unused.length>0){setSlot({type:'deck',index:i});return;}if(shop.freeSpins>0){setResult(null);setSpinSlot(i);return;}toast(tr('No cards left. Earn RPM in battles and visit the shop.'));}
 async function freeSpin(){if(spinSlot===null||spinning)return;setSpinning(true);const r=await spin(null);if(typeof r==='string'){setSpinning(false);if(r!=='demo')toast.error(tr('Spin failed'));return;}setResult(r);}
 function spinDone(){setSpinning(false);if(result?.card&&spinSlot!==null)onReplace('deck',spinSlot,result.card);}
 const currentCard=slot?.type==='deck'?deck[slot.index]:undefined;
 const currentTag=slot?.type==='tags'?tags[slot.index]:undefined;
 function replace(id:string){if(!slot||disabled)return;onReplace(slot.type,slot.index,id);setSlot(null);}
 return <>
  <FittedHand><section className="cw-deck cw-deck-editor" data-no-pull>
   <div className="cw-deck-label">{tr('Your deck')} · {deck.length}/5</div>
   <div className="cw-hand-with-tags"><div className="cw-hand">{Array.from({length:5},(_,i)=>{const c=deck[i];return c?<BattleCard key={i} card={c} showCondition disabled={disabled} onSelect={()=>setSlot({type:'deck',index:i})}/>:<div className="cw-card-slot" key={i}><Button variant="outline" className="cw-empty-slot" disabled={disabled} aria-label={tr('Choose card {0}',[i+1])} onClick={()=>openEmpty(i)}><Plus/></Button></div>;})}</div>
   <aside className="cw-tags" aria-label={tr('Dog tags')}>{Array.from({length:3},(_,i)=>{const t=tags[i];return t?<BattleDogTag key={i} tag={t} selected={false} disabled={disabled} used={false} onSelect={()=>setSlot({type:'tags',index:i})}/>:<Button key={i} variant="outline" className="cw-empty-slot" disabled={disabled} aria-label={tr('Choose dog tag {0}',[i+1])} onClick={()=>setSlot({type:'tags',index:i})}><Plus/></Button>;})}</aside></div>
  </section></FittedHand>
  <Dialog open={!!slot} onOpenChange={open=>{if(!open)setSlot(null);}}><DialogContent className="cw-screen cw-picker max-w-3xl rounded-lg" aria-describedby={undefined}>
   <DialogTitle>{tr(slot?.type==='tags'?'Replace dog tag':'Replace card')}</DialogTitle>
   {(currentCard||currentTag)&&<DialogDescription>{tr('Replacing {0}',[currentCard?.name??tr(currentTag?.name??'')])}</DialogDescription>}
    <div className="cw-replacement-list">{slot?.type==='deck'?pool.filter(c=>!deck.some(x=>x.id===c.id)).map(c=><BattleCard key={c.id} card={c} compareTo={currentCard} showCondition disabled={disabled} onSelect={()=>replace(c.id)}/>):availableTags.filter(t=>!tags.some(x=>x.id===t.id)&&!tags.some((x,i)=>i!==slot?.index&&x.power===t.power)).map(t=><div key={t.id} className="cw-tag-option"><BattleDogTag tag={t} selected={false} used={false} disabled={disabled} onSelect={()=>replace(t.id)}/><span className="text-xs text-muted-foreground text-center">{tr(POWER_LABELS[t.power])}</span></div>)}</div>
  </DialogContent></Dialog>
  <Dialog open={spinSlot!==null} onOpenChange={open=>{if(!open&&!spinning)setSpinSlot(null);}}><DialogContent className="cw-battle-menu rounded-lg" aria-describedby={undefined}>
   <DialogTitle>{tr('Spin for card {0}',[(spinSlot??0)+1])}</DialogTitle>
   <p className="text-sm text-muted-foreground">{tr('{0} free spins left · Road 50% · Race 30% · GTLM 8% · TT 8% · F1 2% · MotoGP 2%',[shop.freeSpins])}</p>
   {(spinning||result)&&<SpinReel key={result?.card??'wait'} result={result?spinLabel(result):'…'} labels={REEL_LABELS} onDone={result?spinDone:()=>undefined}/>}
   {result&&!spinning?<Button onClick={()=>setSpinSlot(null)}>{tr('Done')}</Button>:<Button disabled={spinning||disabled||shop.freeSpins<1} onClick={()=>void freeSpin()}><Dices className="w-4 h-4 mr-2"/>{tr('Spin the wheel')}</Button>}
  </DialogContent></Dialog>
 </>;
}