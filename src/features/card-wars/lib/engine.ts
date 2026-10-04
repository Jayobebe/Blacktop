import { CATEGORIES, type BattleCard, type BattleState, type DogTag, type Category } from '../types';
import { BRAND_CARDS } from './catalog';
export function shuffle<T>(values: T[], random:()=>number=Math.random): T[] { const a=values.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

/** Neutral, category-blind play used only before a run to estimate deck difficulty.
 * Dog tags and player strategy are deliberately not priced into this estimate. */
export const COMPUTER_WIN_TARGET = 0.51;
function seededRandom(seed: number): () => number {
 return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
export function estimatePlayerWins(player: BattleCard[], opponent: BattleCard[], trials = 128, seed = 1): number {
 const random = seededRandom(seed);
 let wins = 0;
 for (let trial = 0; trial < trials; trial++) {
  const hp = [Array(5).fill(100), Array(5).fill(100)];
  const penaltyRound = random() < .125 ? 1 + Math.floor(random() * 4) : -1;
  for (let round = 0; round < 400; round++) {
   const alive = hp.map(hand => hand.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0));
   if (!alive[0].length || !alive[1].length) break;
   const aIndex = alive[0][Math.floor(random() * alive[0].length)];
   const bIndex = alive[1][Math.floor(random() * alive[1].length)];
   const aCard = player[aIndex], bCard = opponent[bIndex];
   const allowed = CATEGORIES.filter(c => c !== 'lean' || ((aCard.displayVehicle ?? aCard.vehicle) === 'bike' && bCard.vehicle === 'bike'));
   const category = allowed[Math.floor(random() * allowed.length)];
   const penalty = penaltyRound === round && category === 'lean' ? .8 : 1;
   const difference = (aCard.ratings[category] - bCard.ratings[category]) * penalty;
   if (difference !== 0) {
    const loser = difference > 0 ? 1 : 0;
    const index = loser === 0 ? aIndex : bIndex;
    hp[loser][index] = Math.max(0, hp[loser][index] - Math.min(65, 20 + Math.round(Math.abs(difference) * .7)));
   }
  }
  // Tied/stalled neutral games count as half a win for matchmaking only.
  const totals = hp.map(hand => hand.reduce((a, b) => a + b, 0));
  wins += totals[0] === totals[1] ? .5 : totals[0] > totals[1] ? 1 : 0;
 }
 return wins / trials;
}

/** Select real catalog cards, never weaken their stats or rig a live round.
 * A bounded search approaches the target; extreme decks can exceed catalog limits. */
export function createComputerDeck(player: BattleCard[], random: () => number = Math.random): BattleCard[] {
 const seed = Math.floor(random() * 4294967296);
 const usesLean = player.every(c => (c.displayVehicle ?? c.vehicle) === 'bike');
 const power = (card: BattleCard) => {
  const categories = CATEGORIES.filter(c => c !== 'lean' || (usesLean && card.vehicle === 'bike'));
  return categories.reduce((sum, c) => sum + card.ratings[c], 0) / categories.length;
 };
 const targetPower = player.reduce((sum, card) => sum + power(card), 0) / player.length;
 const near = BRAND_CARDS.slice().sort((a, b) => Math.abs(power(a) - targetPower) - Math.abs(power(b) - targetPower)).slice(0, 12);
 const candidates = [
  BRAND_CARDS.slice().sort((a, b) => power(a) - power(b)).slice(0, 5),
  BRAND_CARDS.slice().sort((a, b) => power(b) - power(a)).slice(0, 5),
  ...Array.from({ length: 16 }, () => shuffle(near, random).slice(0, 5)),
  ...Array.from({ length: 14 }, () => shuffle(BRAND_CARDS, random).slice(0, 5)),
 ];
 const mirror = player.map(card => BRAND_CARDS.find(c => c.id === card.id));
 if (mirror.every((card): card is BattleCard => card !== undefined)) candidates.push(mirror);
 const ranked = candidates.map(deck => ({ deck, rate: estimatePlayerWins(player, deck, 96, seed) }))
  .sort((a, b) => Math.abs(a.rate - COMPUTER_WIN_TARGET) - Math.abs(b.rate - COMPUTER_WIN_TARGET));
 const finalists = ranked.slice(0, 6).map(({ deck }) => ({ deck, rate: estimatePlayerWins(player, deck, 512, seed ^ 0x9e3779b9) }));
 const below = finalists.filter(c => c.rate <= COMPUTER_WIN_TARGET).sort((a, b) => b.rate - a.rate)[0];
 const above = finalists.filter(c => c.rate > COMPUTER_WIN_TARGET).sort((a, b) => a.rate - b.rate)[0];
 if (below && above) {
  const chanceOfAbove = (COMPUTER_WIN_TARGET - below.rate) / (above.rate - below.rate);
  return random() < chanceOfAbove ? above.deck : below.deck;
 }
 finalists.sort((a, b) => Math.abs(a.rate - COMPUTER_WIN_TARGET) - Math.abs(b.rate - COMPUTER_WIN_TARGET));
 return finalists[0]?.deck ?? candidates[0];
}
export function createRun(player: BattleCard[], random:()=>number=Math.random): BattleState {
 if(player.length!==5 || new Set(player.map(c=>c.id)).size!==5) throw new Error('Deck needs five unique cards');
 const opponent=createComputerDeck(player,random);
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
