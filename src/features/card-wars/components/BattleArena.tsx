import { useEffect, useRef, useState } from 'react';
import { Swords, Shuffle, Heart, Zap, LockKeyhole } from 'lucide-react';
import { BattleDogTag } from './BattleDogTag';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { BattleCard } from './BattleCard';
import { CATEGORIES, type BattleCard as Card, type Category, type DogTag } from '../types';
export const CATEGORY_LABELS:Record<Category,string>={speed:'Speed',lean:'Lean',g:'G-force',distance:'Distance',corners:'Corners'};
export interface Reveal { id:string; player:Card; opponent:Card; category:Category; damage:number; winner:number|null; hp:number[][]; beforeHp?:number[][] }
const POWERS={reroll:Shuffle,heal:Heart,boost:Zap};
export function BattleArena({player,opponent,hp,round,disabled,submitted,selected,tags,usedTags,tag,onTag,onPick,reveal,onRevealEnd,penalty}:{player:Card[];opponent:Card[];hp:number[][];round:number;disabled:boolean;submitted?:boolean;selected?:number|null;tags:DogTag[];usedTags:string[];tag:string|null;onTag:(id:string|null)=>void;onPick:(index:number)=>void;reveal:Reveal|null;onRevealEnd:()=>void;penalty?:boolean}){
 const [phase,setPhase]=useState<'pick'|'spin'|'impact'|'done'>('pick');
 const finish=useRef(onRevealEnd);finish.current=onRevealEnd;
 useEffect(()=>{
  if(!reveal){setPhase('pick');return;}
  const reduced=document.documentElement.classList.contains('thermal')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  setPhase('spin');
  const impact=setTimeout(()=>{setPhase('impact');if(reveal.damage>0)haptics.heavy();},reduced?200:2400);
  const done=setTimeout(()=>setPhase('done'),reduced?450:3150);
  const end=setTimeout(()=>finish.current(),reduced?900:4300);
  return()=>{clearTimeout(impact);clearTimeout(done);clearTimeout(end);};
 },[reveal?.id]);
 const shownHp=reveal && (phase==='impact'||phase==='done')?reveal.hp:reveal?.beforeHp??hp;
 const locked=disabled||submitted||!!reveal;
 const wheel=CATEGORIES.concat(CATEGORIES,CATEGORIES,CATEGORIES,CATEGORIES,CATEGORIES);
 const categoryIndex=reveal?CATEGORIES.indexOf(reveal.category):0;
 return <div className={`cw-arena cw-phase-${phase}`} data-no-pull>
  <section className="cw-deck cw-opponent"><div className="cw-deck-label"><span>{tr('Opponent')}</span><LockKeyhole className="w-3 h-3"/></div><div className="cw-hand-with-tags"><div className="cw-hand">{opponent.map((c,i)=><BattleCard key={c.id} card={c} hp={shownHp[1]?.[i]??100} selected={reveal?.opponent.id===c.id} readOnly/>)}</div><div aria-hidden="true"/></div></section>
  <section className="cw-showdown"><div className="cw-round font-mono">{tr('Round {0} / 5',[Math.min(5,round)])}</div>
   {reveal ? <><div className="cw-duel">
    <div className={`cw-contender cw-contender-player ${phase==='impact'?(reveal.winner===0?'cw-strike-player':reveal.winner===1?'cw-hit':''):''}`}><BattleCard card={reveal.player} hp={shownHp[0]?.[player.findIndex(c=>c.id===reveal.player.id)]??100} category={phase==='spin'?undefined:reveal.category} readOnly/></div>
    <Swords className="cw-versus text-accent"/>
    <div className={`cw-contender cw-contender-opponent ${phase==='impact'?(reveal.winner===1?'cw-strike-opponent':reveal.winner===0?'cw-hit':''):''}`}><BattleCard card={reveal.opponent} hp={shownHp[1]?.[opponent.findIndex(c=>c.id===reveal.opponent.id)]??100} category={phase==='spin'?undefined:reveal.category} readOnly/></div>
   </div><div className="cw-wheel" aria-label={tr('Category wheel')}><div className="cw-wheel-marker"/><div key={reveal.id} className="cw-wheel-track" style={{transform:`translateY(-${(20+categoryIndex)*44}px)`}}>{wheel.map((c,i)=><div key={i} className="cw-wheel-item">{tr(CATEGORY_LABELS[c])}</div>)}</div></div><div className="cw-round-status" aria-live="polite">{phase!=='spin'&&<span className="cw-comparison font-mono">{reveal.player.ratings[reveal.category]} : {reveal.opponent.ratings[reveal.category]} · </span>}{phase==='spin'?tr('Cards locked'):reveal.damage===0?tr('Draw'):tr('{0} damage',[reveal.damage])}</div></> : <div className="cw-await"><Swords className="w-8 h-8 text-accent"/><h2>{tr(submitted?'Waiting for opponent':'Choose your card')}</h2><span className="text-muted-foreground text-xs">{tr('Category hidden')}</span>{submitted&&<LockKeyhole className="w-4 h-4 text-accent"/>}</div>}
   {penalty&&<p className="text-warning text-xs">{tr('Rain · lean ratings reduced by 20% this round')}</p>}
  </section>
  <section className="cw-deck cw-player"><div className="cw-deck-label"><span>{tr('Your deck')}</span></div><div className="cw-hand-with-tags"><div className="cw-hand">{player.map((c,i)=><BattleCard key={c.id} card={c} hp={shownHp[0]?.[i]??100} selected={reveal?.player.id===c.id||selected===i} disabled={locked||shownHp[0]?.[i]===0} onSelect={()=>onPick(i)}/>)}</div><aside className="cw-tags" aria-label={tr('Dog tags')}>{tags.map(t=><BattleDogTag key={t.id} tag={t} selected={tag===t.id} disabled={locked} used={usedTags.includes(t.id)} onSelect={()=>onTag(tag===t.id?null:t.id)}/>)}</aside></div></section>
 </div>;
}
