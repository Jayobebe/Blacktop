import { useSyncExternalStore } from 'react';
import { isDemoModeActive, onDemoModeChange } from '@/lib/demoMode';
import { STARTERS, STARTER_TAGS } from './catalog';
import type { VaultState } from '../types';
const KEY='bt.card_wars.v1';
const initial=():VaultState=>({deck:STARTERS.slice(),tags:STARTER_TAGS.map(t=>t.id),rewards:[],unlocks:[],run:null});
function load():VaultState {try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x && Array.isArray(x.deck)&&Array.isArray(x.tags)&&Array.isArray(x.rewards))return {...initial(),...x};}catch{}return initial();}
let state=isDemoModeActive()?initial():load(); const listeners=new Set<()=>void>();
onDemoModeChange(()=>{state=isDemoModeActive()?initial():load();listeners.forEach(l=>l());});
export function updateVault(patch:Partial<VaultState>){state={...state,...patch};if(!isDemoModeActive())try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}listeners.forEach(l=>l());}
export function claimReward(id:string):boolean {const run=state.run;if(!run || run.result!=='win'||run.rewardClaimed||!run.rewardOrder.includes(id))return false;updateVault({rewards:Array.from(new Set([...state.rewards,id])),run:{...run,rewardClaimed:true,chosenReward:id}});return true;}
export function useVault(){return useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l);},()=>state,()=>state);}
