import { usePeaksHidden } from '@/features/ride';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Swords, Store, Shuffle, Heart, Zap, Copy, Flag, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DeckEditor } from './DeckEditor';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';
import { useSettings } from '@/features/settings';
import { useVehicleCards, useCollectedCards, useSpectreCards } from '@/features/cards';
import { useRideHistory, useRideSpeed } from '@/features/ride';
import { useDemoMode } from '@/lib/demoMode';
import { useServerCap } from '@/lib/serverCaps';
import { shareOrigin } from '@/lib/platform';
import { loadQrScanner } from '@/lib/qrScanner';
import { demoBlocked } from '@/lib/demoGuard';
import { tr } from '@/lib/i18n';
import { BattleDogTag } from './BattleDogTag';
import { BattleCard } from './BattleCard';
import { RewardShuffle } from './RewardShuffle';
import { BattleArena, type Reveal } from './BattleArena';
import { CATALOG, STARTERS, STARTER_TAGS, archetypeFor, unlockCard, cardIdentity } from '../lib/catalog';
import { createRun, playRound } from '../lib/engine';
import { withWear, conditionOf, wearAfterRun, fetchServerWear, reportOfflineWear } from '../lib/wear';
import { useVault, updateVault, claimReward } from '../lib/store';
import { battleAction, type OnlineBattle } from '../lib/online';
import { useShop, refreshShop, setRpm, rewardOffline } from '../lib/shop';
import { ShopPage } from './ShopPage';
import { CATEGORIES, type BattleCard as Card, type DogTag, type Category } from '../types';
import '../card-wars.css';
const LABELS:Record<Category,string>={speed:'Speed',lean:'Lean',g:'G-force',distance:'Distance',corners:'Corners'};
const POWERS={reroll:Shuffle,heal:Heart,boost:Zap};
export function CardWarsScreen(){
 const {settings}=useSettings();const vault=useVault();const {enabled:demo}=useDemoMode();const cap=useServerCap('cardWars');
 const peaksHidden=usePeaksHidden();const {cards:own}=useVehicleCards();const {collected}=useCollectedCards();const {spectres}=useSpectreCards();const {rides,burnedTotals}=useRideHistory();
  const [params]=useSearchParams();const [view,setView]=useState(params.has('battle')?'players':vault.run&&!vault.run.result?'computer':'deck');const [online,setOnline]=useState<OnlineBattle|null>(null);const [code,setCode]=useState(params.get('battle')||'');const [busy,setBusy]=useState(false);const [tag,setTag]=useState<string|null>(null);const [scan,setScan]=useState(false);const [clock,setClock]=useState(Date.now());
 const [battleMenu,setBattleMenu]=useState(params.has('battle'));const shop=useShop();
 useEffect(()=>{void refreshShop();},[]);
 useEffect(()=>{if(typeof online?.balance==='number')setRpm(online.balance);},[online?.balance]);
 const [reveal,setReveal]=useState<Reveal|null>(null);const [displayOnline,setDisplayOnline]=useState<OnlineBattle|null>(null);const seen=useRef('');
 const riding=useRideSpeed().isActive;
 const hours=(rides.filter(r=>r.endedAt).reduce((s,r)=>s+r.duration,0)+Object.values(burnedTotals).reduce((s,r)=>s+r.duration,0))/3600;
 useEffect(()=>{const ids=[...(hours>=10?['demo']:[]),...(hours>=50?['dev']:[])];const next=Array.from(new Set([...vault.unlocks,...ids]));if(next.length!==vault.unlocks.length&&!demo)updateVault({unlocks:next});},[hours,demo,vault.unlocks]);
 const pool=useMemo(()=>{
 const ids=Array.from(new Set([...shop.owned,...vault.rewards]));const a:Card[]=ids.flatMap(id=>{const c=CATALOG.find(x=>x.id===id);return c?[{...c,source:shop.owned.includes(id)?'purchased' as const:'reward' as const}]:[];});
 for(const id of vault.unlocks)if(id==='demo'||id==='dev')a.push(unlockCard(id));
  if(!peaksHidden)for(const c of own){const b=archetypeFor(c.bike.id);a.push({...b,...cardIdentity(c.bike.name,c.bike.makeModel),id:`own:${c.bike.id}`,name:c.bike.name||b.name,image:c.bike.photos.hero||undefined,tier:c.tier,source:'collection'});}
  for(const c of collected){if(c.s?.topSpeedMph==null||c.s?.maxGForce==null)continue;const b=archetypeFor(c.i);a.push({...b,...cardIdentity(c.n,c.m),id:`collected:${c.key}`,name:c.n,image:c.img,tier:c.t,source:'collection'});}
 return a;
 },[vault.rewards,vault.unlocks,own,collected,peaksHidden,shop.owned]);
 const tags:DogTag[]=useMemo(()=>[...STARTER_TAGS,...spectres.map((s,i)=>({id:`spectre:${s.key}`,name:s.setterName,spectre:s,power:STARTER_TAGS[i%3].power,vehicle:archetypeFor(s.card.i).vehicle}))],[spectres]);
 const wornPool=useMemo(()=>pool.map(c=>withWear(c,conditionOf(vault.wear,c.id))),[pool,vault.wear]);
 useEffect(()=>{const r=vault.run;if(!r||!r.result||vault.rpmApplied===r.id||demo)return;updateVault({rpmApplied:r.id});void rewardOffline(r.result).then(n=>{if(n>0)toast.success(tr('+{0} RPM',[n]));});},[vault.run,vault.rpmApplied,demo]);
 useEffect(()=>{const r=vault.run;if(!r||!r.result||vault.wearApplied===r.id||demo)return;updateVault({wear:wearAfterRun(vault.wear,r,pool),wearApplied:r.id});void reportOfflineWear(r).then(w=>{if(w)updateVault({wear:{...w}});});},[vault.run,vault.wear,vault.wearApplied,pool,demo]);
 useEffect(()=>{const sync=()=>{void fetchServerWear().then(w=>{if(w&&Object.keys(w).length)updateVault({wear:w});});};sync();window.addEventListener('focus',sync);window.addEventListener('blacktop:refresh',sync);return()=>{window.removeEventListener('focus',sync);window.removeEventListener('blacktop:refresh',sync);};},[demo,online?.status]);
 const deck=vault.deck.map(id=>wornPool.find(c=>c.id===id)).filter((c):c is Card=>!!c);const deckTags=vault.tags.map(id=>tags.find(t=>t.id===id)).filter((t):t is DogTag=>!!t);
 const run=vault.run;const selectedTag=deckTags.find(t=>t.id===tag);
 async function action(a:'status'|'create'|'join'|'play'|'leave',card?:number){if(busy||((a!=='status')&&(riding||demoBlocked())))return;setBusy(true);try{const result=await battleAction(a,a==='join'?code.trim():online?.code,a==='create'||a==='join'?deck.map(c=>c.archetype):undefined,card,selectedTag?STARTER_TAGS.findIndex(t=>t.power===selectedTag.power):undefined,online?.round);setOnline(result);setTag(null);}catch(e){toast.error(e instanceof Error?e.message:tr('Battle unavailable'));}finally{setBusy(false);}}
 useEffect(()=>{if(view!=='players'||!cap||demo)return;let stopped=false;let fetching=false;const poll=async()=>{if(fetching||document.hidden)return;fetching=true;try{const next=await battleAction('status',online?.code);if(!stopped)setOnline(next);}catch{}finally{fetching=false;}};void poll();const timer=setInterval(()=>void poll(),4000);return()=>{stopped=true;clearInterval(timer);};},[view,cap,demo,online?.code]);
 useEffect(()=>{if(!online?.deadline)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[online?.deadline]);
 useEffect(()=>{if(!scan)return;let cancelled=false;let scanner:InstanceType<Awaited<ReturnType<typeof loadQrScanner>>>|null=null;void(async()=>{try{const Qr=await loadQrScanner();if(cancelled)return;scanner=new Qr('cw-scanner');await scanner.start({facingMode:'environment'},{fps:8,qrbox:220},text=>{try{const url=new URL(text);const value=url.searchParams.get('battle');if(value&&/^[a-f0-9-]{36}$/i.test(value)){setCode(value);setScan(false);}}catch{}},()=>{});}catch{setScan(false);toast.error(tr('Could not access camera'));}})();return()=>{cancelled=true;const s=scanner;if(s)void(async()=>{if(s.isScanning)await s.stop();s.clear();})().catch(()=>{});};},[scan]);
 useEffect(()=>{
  if(!online)return;
  const last=online.log?.[online.log.length-1];const id=last?`${online.code}:${last.round}`:'';
  if(last&&displayOnline&&displayOnline.code===online.code&&id!==seen.current&&(displayOnline.log?.length??0)<(online.log?.length??0)){
   const player=CATALOG.find(c=>c.id===(online.side===1?last.card1:last.card2));const opponent=CATALOG.find(c=>c.id===(online.side===1?last.card2:last.card1));
   if(player&&opponent){seen.current=id;setReveal({id,player,opponent,category:CATEGORIES[last.category-1],damage:last.damage,winner:last.winner===null?null:last.winner===online.side?0:1,hp:[online.hp??[],online.rivalHp??[]]});return;}
  }
  if(!reveal)setDisplayOnline(online);
 },[online,reveal]);
 function finishReveal(){setReveal(null);if(view==='players')setDisplayOnline(online);}
 function pickComputer(index:number){if(!run||run.result||reveal||riding)return;const next=playRound(run,index,selectedTag);const last=next.log[next.log.length-1];if(!last)return;const player=next.player.find(c=>c.id===last.player);const opponent=next.opponent.find(c=>c.id===last.opponent);if(!player||!opponent)return;setReveal({id:`${next.id}:${next.round}`,player,opponent,category:last.category,damage:last.damage,winner:last.winner,hp:next.hp,beforeHp:structuredClone(run.hp)});updateVault({run:next});setTag(null);}
 function replaceSlot(type:'deck'|'tags',index:number,id:string){
  if(riding||locked)return;
  const values=(type==='deck'?deck:deckTags).map(x=>x.id);
  if(values.some((x,i)=>i!==index&&x===id))return;
  if(type==='tags'&&values.some((x,i)=>i!==index&&tags.find(t=>t.id===x)?.power===tags.find(t=>t.id===id)?.power))return;
  values[index]=id;updateVault({[type]:values});
 }
 function startComputer(){if(riding||locked||deck.length!==5||deckTags.length!==3)return;updateVault({run:createRun(deck)});setTag(null);setBattleMenu(false);setView('computer');}
 if(!settings.blacktopWorldEnabled||!settings.collectiblesEnabled)return <Navigate to="/arcade" replace/>;
 const locked=!!run&&!run.result || online?.status==='playing'||online?.status==='waiting';
 const shownOnline=displayOnline??online;const liveDeck=shownOnline?.deck?.flatMap(id=>{const c=CATALOG.find(x=>x.id===id);return c?[c]:[];})||[];
 const inBattle=view==='computer'&&!!run&&(!run.result||!!reveal)||view==='players'&&(online?.status==='playing'||shownOnline?.status==='playing'||!!reveal);
  return <main className={`cw-screen cw-page ${inBattle?'cw-active':''} text-foreground`}>
  {inBattle?<div className="flex justify-end mb-4"><Button variant="outline" disabled={busy||riding||!!reveal} onClick={()=>{if(view==='players'){void action('leave');}else if(run){updateVault({run:{...run,result:'loss'}});setTag(null);}}}><Flag className="w-4 h-4 mr-2"/>{tr(view==='players'?'Forfeit · lose 10 points':'Forfeit')}</Button></div>:<>
  <PageHeader title={tr('Card Wars')} backTo="/arcade" subtitle={tr('Deck · {0} cards · {1} dog tags',[vault.deck.length,vault.tags.length])} right={view==='computer'?<Button variant="outline" onClick={()=>setView('deck')}>{tr('Your deck')}</Button>:<div className="flex gap-2 items-center"><span className="font-mono text-sm text-accent">{shop.balance??'—'} RPM</span><Button disabled={riding} onClick={()=>{setView('players');setBattleMenu(true);}}><Swords className="w-4 h-4 mr-2"/>{tr('Battle')}</Button></div>}/>
  </>}
 {riding&&<p className="text-destructive mb-4">{tr('Battles unavailable during a ride')}</p>}
  {view==='shop'&&!inBattle&&<ShopPage onBack={()=>setView('deck')} disabled={riding||demo}/>}
  {!inBattle&&view!=='computer'&&view!=='shop'&&<><DeckEditor deck={deck} tags={deckTags} pool={wornPool} availableTags={tags} disabled={riding||locked} onReplace={replaceSlot}/>
  <Button variant="outline" className="w-full mt-2" onClick={()=>setView('shop')}><Store className="w-4 h-4 mr-2"/>{tr('Shop')}</Button>
  {locked&&<p role="status" className="text-sm text-muted-foreground">{tr('Your deck is locked for this battle. Finish or forfeit the battle to change it.')}</p>}
  <div className="cw-unlocks border-t border-border text-xs text-muted-foreground"><p>{tr('Demo card · {0}/10 hours',[Math.min(10,hours).toFixed(1)])}</p><p>{tr('Dev card · {0}/50 hours',[Math.min(50,hours).toFixed(1)])}</p></div></>}
  {view==='computer'&&<>
 {run&&(!run.result||reveal)&&<><BattleArena player={run.player} opponent={run.opponent} hp={run.hp} round={reveal?run.round:run.round+1} disabled={riding} tags={deckTags} usedTags={run.usedTags} tag={tag} onTag={setTag} onPick={pickComputer} reveal={reveal} onRevealEnd={finishReveal} penalty={run.penaltyRound===(reveal?run.round-1:run.round)}/></>}
  {run?.result&&!reveal&&<><h2 className="text-xl font-semibold mb-4">{tr(run.result==='win'?'Victory':run.result==='draw'?'Draw':'Defeat')}</h2>
 {run.chosenReward&&<div className="max-w-48 mb-4">{run.opponent.filter(c=>c.id===run.chosenReward).map(c=><BattleCard key={c.id} card={c} selected/>)}</div>}
 {run.result==='win'&&!run.rewardClaimed&&<RewardShuffle key={run.id} run={run} riding={riding} onComplete={()=>updateVault({run:{...run,rewardShuffleComplete:true}})} onClaim={id=>{const card=run.opponent.find(c=>c.id===id);if(card&&claimReward(id))toast.success(tr('Added {0} to your vault',[card.name]));}}/>}
 {(run.result!=='win'||run.rewardClaimed)&&<Button onClick={()=>{updateVault({run:null});setView('deck');}}>{tr('New battle')}</Button>}
 </>}{run&&!reveal&&run.log.length>0&&<div className="cw-latest-round text-xs text-muted-foreground">{run.log.slice(-1).map(l=><p key={l.round}>{tr('Round {0} · {1} · {2} damage',[l.round,tr(LABELS[l.category]),l.damage])}</p>)}</div>}</>}
 {view==='players'&&<BattleSetup open={battleMenu} inBattle={!!inBattle} onClose={()=>setBattleMenu(false)}>{!inBattle&&<><Button className="w-full h-12 mb-4" disabled={riding||locked||deck.length!==5||deckTags.length!==3} onClick={startComputer}><Swords className="w-4 h-4 mr-2"/>{tr('Computer battle')}</Button><h3 className="font-semibold mb-4">{tr('Player battle')}</h3><div className="flex justify-between mb-4"><span>RPM</span><strong className="font-mono text-accent">{online?.balance??'—'}</strong></div><p className="text-sm text-muted-foreground mb-5">{tr('10 RPM each · winner takes 70 · draws refund stakes · no cards lost')}</p></>}
 {!cap&&<p>{tr('Player battles are not available yet')}</p>}
 {cap&&!online?.status&&<><Button disabled={busy||riding||demo||deck.length!==5||deckTags.length!==3||new Set(deck.map(c=>c.archetype)).size!==5} className="w-full mb-4" onClick={()=>void action('create')}><Swords className="w-4 h-4 mr-2"/>{tr('Invite player')}</Button><Input aria-label={tr('Battle code')} placeholder={tr('Battle code')} value={code} onChange={e=>setCode(e.target.value)}/><div className="flex gap-2 mt-3"><Button disabled={busy||riding||demo||!/^[a-f0-9-]{36}$/i.test(code.trim())||deck.length!==5||deckTags.length!==3} onClick={()=>void action('join')}>{tr('Accept · 10 RPM')}</Button><Button variant="outline" disabled={riding||demo} onClick={()=>setScan(!scan)} aria-label={tr('Scan battle QR')}><ScanLine className="w-4 h-4"/></Button></div>{scan&&<div id="cw-scanner" className="mt-4"/>}</>}
 {online?.status==='waiting'&&online.code&&<div className="space-y-4"><p>{tr('Waiting for opponent · 10 RPM reserved')}</p><div className="p-4 bg-foreground text-background w-fit rounded-lg"><QRCodeSVG value={`${shareOrigin()}/arcade/card-wars?battle=${online.code}`} size={180}/></div><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(online.code||'').then(()=>toast.success(tr('Copied')))}><Copy className="w-4 h-4 mr-2"/>{tr('Copy battle code')}</Button></div>}
 {(online?.status==='waiting'||online?.status==='playing')&&<p className="cw-reconnect text-xs text-muted-foreground">{tr('Reconnect window · {0}s',[Math.max(0,Math.ceil((new Date(online.deadline||'').getTime()-clock)/1000))])}</p>}
 {(shownOnline?.status==='playing'||reveal)&&shownOnline&&<BattleArena player={liveDeck} opponent={shownOnline.rivalDeck?.flatMap(id=>{const c=CATALOG.find(x=>x.id===id);return c?[c]:[];})??[]} hp={[shownOnline.hp??[],shownOnline.rivalHp??[]]} round={shownOnline.round??1} disabled={busy||riding} submitted={online?.submitted} selected={online?.selected} tags={deckTags} usedTags={deckTags.filter(t=>shownOnline.used?.includes(STARTER_TAGS.findIndex(x=>x.power===t.power))).map(t=>t.id)} tag={tag} onTag={setTag} onPick={i=>void action('play',i)} reveal={reveal} onRevealEnd={finishReveal} penalty={shownOnline.penalty}/>}
  {online?.status==='waiting'&&<Button variant="ghost" className="mt-4" disabled={busy||!!reveal} onClick={()=>void action('leave')}><Flag className="w-4 h-4 mr-2"/>{tr(online.status==='waiting'?'Cancel invitation':'Forfeit · lose 10 points')}</Button>}
 {!reveal&&(online?.status==='finished'||online?.status==='cancelled')&&<div className="space-y-4"><h2 className="text-xl font-semibold">{tr(online.result==='win'?'Victory':online.result==='loss'?'Defeat':online.result==='draw'?'Draw':'Invitation cancelled')}</h2><Button onClick={()=>{setOnline({balance:online.balance});setDisplayOnline(null);seen.current='';setCode('');setBattleMenu(false);setView('deck');}}>{tr('New battle')}</Button></div>}
 {!reveal&&online?.log?.slice(-1).map(l=><p className="cw-latest-round text-xs text-muted-foreground" key={l.round}>{tr('Round {0} · {1} · {2} damage',[l.round,tr(LABELS[CATEGORIES[l.category-1]]),l.damage])}</p>)}
 </BattleSetup>}
 </main>;
}

function BattleSetup({open,inBattle,onClose,children}:{open:boolean;inBattle:boolean;onClose:()=>void;children:import('react').ReactNode}){
 if(inBattle)return <>{children}</>;
 return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="cw-battle-menu rounded-lg" aria-describedby={undefined}><DialogTitle>{tr('Battle')}</DialogTitle><div className="cw-battle-options">{children}</div></DialogContent></Dialog>;
}
