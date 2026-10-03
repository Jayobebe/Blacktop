import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import { BattleCard } from './BattleCard';
import type { BattleState } from '../types';

export function RewardShuffle({run,riding,onClaim,onComplete}:{run:BattleState;riding:boolean;onClaim:(id:string)=>void;onComplete:()=>void}) {
 const initial=run.opponent.map(c=>c.id);
 const [stage,setStage]=useState<'show'|'flip'|'shuffle'|'pick'>(run.rewardShuffleComplete?'pick':'show');
 const [order,setOrder]=useState(run.rewardShuffleComplete?run.rewardOrder:initial);
 const [moving,setMoving]=useState<string[]>([]);
 const [slots,setSlots]=useState<{x:number;y:number;width:number}[]>([]);
 const board=useRef<HTMLDivElement>(null);
 const complete=useRef(onComplete);complete.current=onComplete;
 useLayoutEffect(()=>{
  const node=board.current;if(!node)return;
  const measure=()=>{const bounds=node.getBoundingClientRect();setSlots(Array.from(node.querySelectorAll<HTMLElement>('.cw-reward-anchor')).map(e=>{const r=e.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,width:r.width};}));};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(stage!=='flip')return;
  const reduced=document.documentElement.classList.contains('thermal')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cancelled=false;const timers:ReturnType<typeof setTimeout>[]=[];
  let next=initial.slice();let time=reduced?0:650;
  const swap=(a:number,b:number)=>{const ids=[next[a],next[b]];[next[a],next[b]]=[next[b],next[a]];const snapshot=next.slice();timers.push(setTimeout(()=>{if(cancelled)return;setStage('shuffle');setMoving(ids);setOrder(snapshot);},time));time+=reduced?180:850;};
  if(!reduced){swap(0,1);swap(1,2);swap(1,2);swap(0,1);}
  for(let i=0;i<run.rewardOrder.length;i++){const at=next.indexOf(run.rewardOrder[i]);if(at>=0&&at!==i)swap(i,at);}
  timers.push(setTimeout(()=>{if(cancelled)return;setMoving([]);setStage('pick');complete.current();},time));
  return()=>{cancelled=true;timers.forEach(clearTimeout);};
 },[stage==='flip',run.id]);
 return <>
  {stage==='show'&&<Button className="mb-4" disabled={riding} onClick={()=>setStage('flip')}><Shuffle className="w-4 h-4 mr-2"/>{tr('Shuffle reward cards')}</Button>}
  <div ref={board} className="cw-reward-board" aria-busy={stage==='flip'||stage==='shuffle'}>
   {initial.map(id=><div key={id} className="cw-reward-anchor"/>)}
   {run.opponent.map(card=>{const slot=slots[order.indexOf(card.id)];if(!slot)return null;return <div key={card.id} data-reward-id={card.id} className={`cw-reward-position ${moving.includes(card.id)?'cw-reward-moving':''}`} style={{width:slot.width,transform:`translate(${slot.x}px,${slot.y}px)`}}>
    <div className={`cw-reward-flipper ${stage!=='show'?'cw-reward-facedown':''}`}>
     <div className="cw-reward-face cw-reward-front" aria-hidden={stage!=='show'}><BattleCard card={card} readOnly/></div>
     <div className="cw-reward-face cw-reward-back" aria-hidden={stage==='show'}><BattleCard card={card} faceDown disabled={stage!=='pick'||riding} onSelect={()=>onClaim(card.id)}/></div>
    </div>
   </div>;})}
  </div>
 </>;
}
