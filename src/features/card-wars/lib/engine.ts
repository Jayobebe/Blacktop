import { CATEGORIES, type BattleCard, type BattleState, type DogTag, type Category } from '../types';
import { CATALOG } from './catalog';
export function shuffle<T>(values: T[], random:()=>number=Math.random): T[] { const a=values.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
export function createRun(player: BattleCard[], random:()=>number=Math.random): BattleState {
 if(player.length!==5 || new Set(player.map(c=>c.id)).size!==5) throw new Error('Deck needs five unique cards');
 const opponent=shuffle(CATALOG,random).slice(0,5);
 return {id:crypto.randomUUID(),player,opponent,hp:[Array(5).fill(100),Array(5).fill(100)],round:0,categories:shuffle([...CATEGORIES],random),penaltyRound:random()<.125?1+Math.floor(random()*4):-1,usedTags:[],log:[],result:null,rewardOrder:shuffle(opponent.map(c=>c.id),random),rewardClaimed:false};
}
export function playRound(previous:BattleState, index:number, tag?:DogTag, random:()=>number=Math.random):BattleState {
 if(previous.result || !previous.player[index] || previous.hp[0][index]<=0) return previous;
 if(tag && previous.usedTags.includes(tag.id)) return previous;
 const s:BattleState=structuredClone(previous);
 const eligible=s.opponent.map((c,i)=>({c,i})).filter(x=>s.hp[1][x.i]>0);
 const rival=eligible[Math.floor(random()*eligible.length)];
 if(!rival) return {...s,result:'win'};
 const allowed=CATEGORIES.filter(c=>c!=='lean'||((s.player[index].displayVehicle??s.player[index].vehicle)==='bike' && rival.c.vehicle==='bike'));
  let category:Category=allowed[Math.floor(random()*allowed.length)];
 if(!allowed.includes(category))category=allowed[Math.floor(random()*allowed.length)];
 s.categories[s.round]=category;
 const card=s.player[index];
 const resonant=tag?.vehicle===card.vehicle;
 if(tag){s.usedTags.push(tag.id); if(tag.power==='reroll'){const alternatives=allowed.filter(c=>c!==category);category=alternatives[Math.floor(random()*alternatives.length)];s.categories[s.round]=category;} if(tag.power==='heal') s.hp[0][index]=Math.min(100,s.hp[0][index]+(resonant?38:30));}
 const penalty=s.penaltyRound===s.round && category==='lean'?.8:1;
 const a=card.ratings[category]*penalty*(tag?.power==='boost'?(resonant?1.65:1.5):1);
 const b=rival.c.ratings[category]*penalty;
 const winner=a===b?null:a>b?0:1;
 const damage=winner===null?0:Math.min(65,20+Math.round(Math.abs(a-b)*.7));
 if(winner!==null){const loser=1-winner; const target=loser===0?index:rival.i;s.hp[loser][target]=Math.max(0,s.hp[loser][target]-damage);}
 s.log.push({round:s.round+1,category,player:card.id,opponent:rival.c.id,damage,winner}); s.round++;
  if(s.hp.some(h=>h.every(v=>v===0))){const totals=s.hp.map(h=>h.reduce((a,b)=>a+b,0));s.result=totals[0]===totals[1]?'draw':totals[0]>totals[1]?'win':'loss';}
 return s;
}
