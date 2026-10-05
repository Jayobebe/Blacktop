import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { HeaderButton, PageHeader } from '@/components/PageHeader';
import { useCollectedCards, useSpectreCards, useVehicleCards } from '@/features/cards';
import { usePeaksHidden, useRideHistory, useRideSpeed } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { eventSound } from '@/lib/appSound';
import { demoBlocked } from '@/lib/demoGuard';
import { useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { STARTER_TAGS, archetypeFor, cardById, cardIdentity, unlockCard } from '../lib/catalog';
import { createRun, deadlocked, playRound } from '../lib/engine';
import { eventAt } from '../lib/events';
import { battleAction, type OnlineBattle } from '../lib/online';
import { overall } from '../lib/ratings';
import { RULES, V2 } from '../lib/rules';
import { claimPrize, refreshShop, rewardOffline, setRpm, useShop, type BattlePay } from '../lib/shop';
import { claimReward, updateVault, useVault } from '../lib/store';
import { powerIndex, tagRef, tagStrength } from '../lib/tagRules';
import { allTags } from '../lib/tags';
import { conditionOf, flushPendingWear, queueWear, syncWear, wearAfterRun, withWear } from '../lib/wear';
import { CATEGORIES, POWERS, type BattleCard as Card, type DogTag, type TagPower } from '../types';
import { BattleArena, type Reveal } from './BattleArena';
import { BattleResult } from './BattleResult';
import { Garage } from './Garage';
import { HowToPlay, howToSeen } from './HowToPlay';
import { PlayerBattleSheet } from './PlayerBattleSheet';
import { RewardShuffle } from './RewardShuffle';
import { RpmPill } from './RpmPill';
import { ShopPage } from './ShopPage';
import '../card-wars.css';

type View = 'home' | 'shop' | 'computer' | 'players';

const standing = (hp: number[] | undefined) => (hp ?? []).filter((v) => v > 0).length;
const powerAt = (index: number | null | undefined): TagPower | null => (typeof index === 'number' ? POWERS[index] ?? null : null);

/**
 * Card Wars: the deck and everything round it (home), the shop, a battle
 * against the computer (settled here by lib/engine.ts) and a battle against
 * another player (settled by the server, polled). This screen holds the state
 * and decides which of them is showing; the pieces draw themselves.
 */
export function CardWarsScreen() {
  const { settings } = useSettings();
  const vault = useVault();
  const shop = useShop();
  const { enabled: demo } = useDemoMode();
  const cap = useServerCap('cardWars');
  const peaksHidden = usePeaksHidden();
  const { cards: own } = useVehicleCards();
  const { collected } = useCollectedCards();
  const { spectres } = useSpectreCards();
  const { rides, burnedTotals } = useRideHistory();
  const riding = useRideSpeed().isActive;
  const [params] = useSearchParams();
  const invited = params.get('battle') || '';

  // A battle against the computer that was left open (or its prize unpicked) comes straight back.
  const [view, setView] = useState<View>(vault.run ? 'computer' : 'home');
  const [sheet, setSheet] = useState(!!invited);
  const [help, setHelp] = useState(() => !howToSeen() && !vault.run && !invited);
  const [online, setOnline] = useState<OnlineBattle | null>(null);
  const [displayOnline, setDisplayOnline] = useState<OnlineBattle | null>(null);
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [pay, setPay] = useState<Record<string, BattlePay>>({});
  const [wearBefore, setWearBefore] = useState<{ run: string; before: Record<string, number> } | null>(null);
  const [prize, setPrize] = useState<{ run: string; had: boolean; rpm: number } | null>(null);
  const seen = useRef('');
  const lastPlay = useRef<{ round: number; tag: TagPower | null }>({ round: 0, tag: null });

  useEffect(() => {
    void refreshShop();
  }, []);
  useEffect(() => {
    if (typeof online?.balance === 'number') setRpm(online.balance);
  }, [online?.balance]);

  // ── What the player has ──
  const hours = (rides.filter((r) => r.endedAt).reduce((s, r) => s + r.duration, 0) + Object.values(burnedTotals).reduce((s, r) => s + r.duration, 0)) / 3600;
  useEffect(() => {
    const earned = [...(hours >= 10 ? ['demo'] : []), ...(hours >= 50 ? ['dev'] : [])];
    const next = Array.from(new Set([...vault.unlocks, ...earned]));
    if (next.length !== vault.unlocks.length && !demo) updateVault({ unlocks: next });
  }, [hours, demo, vault.unlocks]);

  const pool = useMemo(() => {
    const ids = Array.from(new Set([...shop.owned, ...vault.rewards]));
    const cards: Card[] = ids.flatMap((id) => {
      const c = cardById(id);
      return c ? [{ ...c, source: shop.owned.includes(id) ? ('purchased' as const) : ('reward' as const) }] : [];
    });
    for (const id of vault.unlocks) if (id === 'demo' || id === 'dev') cards.push(unlockCard(id));
    // A rider's own cards battle with a catalog card's ratings (never their ride figures), and wear like road cards.
    if (!peaksHidden)
      for (const c of own) {
        const b = archetypeFor(c.bike.id);
        cards.push({ ...b, ...cardIdentity(c.bike.name, c.bike.makeModel), id: `own:${c.bike.id}`, name: c.bike.name || b.name, image: c.bike.photos.hero || undefined, tier: c.tier, spec: 'factory', source: 'collection' });
      }
    for (const c of collected) {
      if (c.s?.topSpeedMph == null || c.s?.maxGForce == null) continue;
      const b = archetypeFor(c.i);
      cards.push({ ...b, ...cardIdentity(c.n, c.m), id: `collected:${c.key}`, name: c.n, image: c.img, tier: c.t, spec: 'factory', source: 'collection' });
    }
    return cards;
  }, [vault.rewards, vault.unlocks, own, collected, peaksHidden, shop.owned]);

  const tags = useMemo(() => allTags(shop.tags, spectres), [shop.tags, spectres]);
  const wornPool = useMemo(() => pool.map((c) => withWear(c, conditionOf(vault.wear, c.id))), [pool, vault.wear]);
  const deck = vault.deck.map((id) => wornPool.find((c) => c.id === id)).filter((c): c is Card => !!c);
  // One tag per power: the one chosen, or the standard one if that's gone (a tag from another phone, say).
  const chosenTags = vault.tags.map((id) => tags.find((t) => t.id === id)).filter((t): t is DogTag => !!t);
  const deckTags = POWERS.flatMap((power) => chosenTags.find((t) => t.power === power) ?? STARTER_TAGS.find((t) => t.power === power) ?? []);
  const run = vault.run;
  const armed = deckTags.find((t) => t.id === tag);

  // ── A finished battle against the computer: RPM, then wear ──
  useEffect(() => {
    const r = vault.run;
    if (!r || !r.result || vault.rpmApplied === r.id || demo) return;
    updateVault({ rpmApplied: r.id });
    void rewardOffline(r.result).then((paid) => {
      setPay((all) => ({ ...all, [r.id]: paid }));
      if (paid.rpm > 0) eventSound('coin');
    });
  }, [vault.run, vault.rpmApplied, demo]);

  useEffect(() => {
    const r = vault.run;
    if (!r || !r.result || vault.wearApplied === r.id || demo) return;
    const fought = r.log.length > 0;
    if (fought) setWearBefore({ run: r.id, before: Object.fromEntries(r.player.map((c) => [c.id, conditionOf(vault.wear, c.id)])) });
    const raptured = r.log.find((l) => l.raptured?.[0])?.raptured?.[0];
    updateVault({ wear: fought ? wearAfterRun(vault.wear, r, pool) : vault.wear, wearApplied: r.id, ...(raptured ? { beamIn: [raptured] } : {}) });
    if (fought) {
      queueWear(r);
      void flushPendingWear();
    }
  }, [vault.run, vault.wear, vault.wearApplied, pool, demo]);

  useEffect(() => {
    const sync = () => {
      void syncWear();
    };
    sync();
    const timer = setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    window.addEventListener('blacktop:refresh', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('blacktop:refresh', sync);
    };
  }, [demo, online?.status]);

  // ── Player battles: the server's view of this player's battle, polled ──
  /** A poll that set off before a move can land after it: never go back a round. */
  const accept = (next: OnlineBattle) => setOnline((prev) => (prev?.code && prev.code === next.code && (next.log?.length ?? 0) < (prev.log?.length ?? 0) ? prev : next));

  // One look on arrival: a battle or an invitation left open is picked up again.
  useEffect(() => {
    if (!cap || demo) return;
    let stopped = false;
    void battleAction('status')
      .then((next) => {
        if (stopped) return;
        setOnline((prev) => prev ?? next);
        if (next.status === 'waiting') setSheet(true);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [cap, demo]);

  const live = online?.status === 'waiting' || online?.status === 'playing';
  const watching = cap && !demo && (sheet || view === 'players' || live);
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    let fetching = false;
    const poll = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const next = await battleAction('status', { code: online?.code });
        if (!stopped) accept(next);
      } catch {
        /* the next tick tries again */
      } finally {
        fetching = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [watching, online?.code]);

  useEffect(() => {
    if (!online?.deadline || !live) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [online?.deadline, live]);

  useEffect(() => {
    if (online?.status === 'playing') {
      setSheet(false);
      setView('players');
    } else if (online?.status === 'cancelled') {
      toast(tr("Invitation closed. Your {0} RPM is back.", [online.stake ?? RULES.stake]));
      setOnline({ balance: online.balance });
      setDisplayOnline(null);
    }
  }, [online?.status, online?.balance, online?.stake]);

  // A player battle that ended with a card raptured: it beams back into the deck at home.
  const beamed = useRef('');
  useEffect(() => {
    if (online?.status !== 'finished' || !online.code || beamed.current === online.code) return;
    beamed.current = online.code;
    const key = online.side === 1 ? 'r1' : 'r2';
    const ids = (online.log ?? []).flatMap((l) => (l[key] ? [l[key] as string] : []));
    const mine = ids.flatMap((id) => deck.find((c) => c.archetype === id)?.id ?? []);
    if (mine.length) updateVault({ beamIn: mine });
    // Once per finished battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.status, online?.code]);

  /** A card in a player battle: the catalog card the server is comparing, at its condition, under the rider's own name where it's theirs. */
  const battleCard = (id: string, condition: number, mine: boolean): Card | null => {
    const base = cardById(id);
    if (!base) return null;
    const worn = withWear(base, condition);
    const ownCard = mine ? deck.find((c) => c.archetype === id && c.id !== id) : undefined;
    return ownCard ? { ...worn, name: ownCard.name, manufacturer: ownCard.manufacturer, image: ownCard.image, tier: ownCard.tier, displayVehicle: base.vehicle, source: 'collection' } : worn;
  };
  const sideCards = (b: OnlineBattle | null, mine: boolean): Card[] =>
    ((mine ? b?.deck : b?.rivalDeck) ?? []).flatMap((id, i) => battleCard(id, (mine ? b?.wear?.[i] : b?.rivalWear?.[i]) ?? (mine ? conditionOf(vault.wear, id) : 100), mine) ?? []);

  // A new line in the server's log is a round to play back; the table shows the round before until it has.
  useEffect(() => {
    if (!online) return;
    const last = online.log?.[online.log.length - 1];
    const id = last ? `${online.code}:${last.round}` : '';
    if (last && displayOnline && displayOnline.code === online.code && id !== seen.current && (displayOnline.log?.length ?? 0) < (online.log?.length ?? 0)) {
      const first = online.side === 1;
      const player = sideCards(displayOnline, true).find((c) => c.id === (first ? last.card1 : last.card2));
      const opponent = sideCards(displayOnline, false).find((c) => c.id === (first ? last.card2 : last.card1));
      if (player && opponent) {
        seen.current = id;
        const said = typeof last.s1 === 'number' && typeof last.s2 === 'number';
        setReveal({
          id,
          player,
          opponent,
          category: CATEGORIES[last.category - 1],
          first: last.first ? CATEGORIES[last.first - 1] : undefined,
          damage: last.damage,
          winner: last.winner === null ? null : last.winner === online.side ? 0 : 1,
          hp: [online.hp ?? [], online.rivalHp ?? []],
          values: said ? (first ? [last.s1!, last.s2!] : [last.s2!, last.s1!]) : null,
          tags: 't1' in last ? [powerAt(first ? last.t1 : last.t2), powerAt(first ? last.t2 : last.t1)] : [lastPlay.current.round === last.round ? lastPlay.current.tag : null, null],
          event: eventAt(last.event),
          raptured: last.r1 || last.r2 ? (first ? [last.r1 ?? null, last.r2 ?? null] : [last.r2 ?? null, last.r1 ?? null]) : undefined,
        });
        return;
      }
    }
    if (!reveal) setDisplayOnline(online);
    // `sideCards` reads the deck and wear as they are when the round lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, reveal]);

  function finishReveal() {
    setReveal(null);
    if (view === 'players') setDisplayOnline(online);
  }

  async function act(action: 'create' | 'join' | 'play' | 'leave', card?: number) {
    if (busy || riding || demoBlocked()) return;
    setBusy(true);
    try {
      const starting = action === 'create' || action === 'join';
      const result = await battleAction(action, {
        code: action === 'join' ? code.trim() : online?.code,
        ...(starting
          ? {
              deck: deck.map((c) => c.archetype),
              // One per power, in the server's order.
              tags: POWERS.map((power) => {
                const mine = deckTags.find((t) => t.power === power);
                return mine ? tagRef(mine) : '';
              }),
            }
          : {}),
        ...(action === 'play' ? { card, tag: armed ? powerIndex(armed.power) : undefined, round: online?.round } : {}),
      });
      if (action === 'play') lastPlay.current = { round: online?.round ?? 0, tag: armed?.power ?? null };
      accept(result);
      setTag(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Battle unavailable"));
    } finally {
      setBusy(false);
    }
  }

  // ── Battles against the computer ──
  function pickComputer(index: number) {
    if (!run || run.result || reveal || riding) return;
    let next = playRound(run, index, armed);
    if (next === run) return;
    // Evenly matched to the last card, and no Overdrive left to break it: a draw.
    const overdrive = deckTags.some((t) => t.power === 'boost' && !next.usedTags.includes(t.id));
    if (!overdrive && deadlocked(next)) next = { ...next, result: 'draw' };
    setTag(null);
    const last = next.log[next.log.length - 1];
    const player = last && next.log.length > run.log.length ? next.player.find((c) => c.id === last.player) : undefined;
    const opponent = last ? next.opponent.find((c) => c.id === last.opponent) : undefined;
    if (!last || !player || !opponent) {
      updateVault({ run: next });
      return;
    }
    // Health as the round starts: a Pit medic has already done its work.
    const before = structuredClone(run.hp);
    if (armed?.power === 'heal') before[0][index] = Math.min(100, before[0][index] + tagStrength(armed, player));
    setReveal({
      id: `${next.id}:${next.round}`,
      player,
      opponent,
      category: last.category,
      first: last.first,
      damage: last.damage,
      winner: last.winner,
      hp: next.hp,
      beforeHp: before,
      values: last.values ?? null,
      tags: [last.tag ?? null, null],
      event: last.event ?? null,
      raptured: last.raptured,
    });
    updateVault({ run: next });
  }

  const locked = (!!run && !run.result) || live;

  // A player with cards but no deck yet (their first visit, or cards won elsewhere) starts with their best five.
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current || vault.deck.length > 0 || wornPool.length < 5 || locked || riding) return;
    dealt.current = true;
    bestDeck();
    // Once, when the collection has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.deck.length, wornPool.length, locked, riding]);

  function replaceSlot(type: 'deck' | 'tags', index: number, id: string) {
    if (riding || locked) return;
    const values = (type === 'deck' ? deck : deckTags).map((x) => x.id);
    if (values.some((x, i) => i !== index && x === id)) return;
    // One tag per power.
    if (type === 'tags' && values.some((x, i) => i !== index && tags.find((t) => t.id === x)?.power === tags.find((t) => t.id === id)?.power)) return;
    values[index] = id;
    updateVault({ [type]: values });
  }

  /** The five strongest cards as they are now, different ratings first (a player battle needs five different). */
  function bestDeck() {
    if (riding || locked) return;
    const ranked = [...wornPool].sort((a, b) => overall(b) - overall(a) || (b.condition ?? 100) - (a.condition ?? 100));
    const picked: Card[] = [];
    for (const c of ranked) if (picked.length < 5 && !picked.some((p) => p.archetype === c.archetype)) picked.push(c);
    for (const c of ranked) if (picked.length < 5 && !picked.includes(c)) picked.push(c);
    updateVault({ deck: picked.map((c) => c.id) });
  }

  function startComputer() {
    if (riding || locked || deck.length !== 5 || deckTags.length !== 3) return;
    setTag(null);
    setReveal(null);
    updateVault({ run: createRun(deck) });
    setView('computer');
  }

  function claim(id: string) {
    if (!run) return;
    const card = (run.prizes ?? run.opponent).find((c) => c.id === id);
    const had = pool.some((c) => c.id === id);
    if (!card || !claimReward(id)) return;
    eventSound('success');
    setPrize({ run: run.id, had, rpm: 0 });
    // The server records it too (and pays for a duplicate) once it knows the rules.
    void claimPrize(id).then((res) => {
      if (res?.kind === 'duplicate') setPrize({ run: run.id, had: true, rpm: res.rpm });
    });
  }

  if (!settings.blacktopWorldEnabled || !settings.collectiblesEnabled) return <Navigate to="/arcade" replace />;

  const shownOnline = displayOnline ?? online;
  const secondsLeft = online?.deadline && live ? Math.max(0, Math.ceil((new Date(online.deadline).getTime() - clock) / 1000)) : null;
  const cpuBattle = view === 'computer' && !!run && (!run.result || !!reveal);
  const cpuResult = view === 'computer' && !!run && !!run.result && !reveal;
  const pvpBattle = view === 'players' && !!shownOnline && (shownOnline.status === 'playing' || !!reveal);
  const pvpResult = view === 'players' && !reveal && online?.status === 'finished';

  if (cpuBattle && run) {
    return (
      <main className="cw-arena-page text-foreground">
        <BattleArena
          player={run.player}
          opponent={run.opponent}
          hp={run.hp}
          round={reveal ? run.round : run.round + 1}
          disabled={riding}
          tags={deckTags}
          usedTags={run.usedTags}
          tag={tag}
          onTag={setTag}
          onPick={pickComputer}
          reveal={reveal}
          onRevealEnd={finishReveal}
          penalty={run.penaltyRound === (reveal ? run.round - 1 : run.round)}
          gone={[run.log.flatMap((l) => (l.raptured?.[0] ? [l.raptured[0]] : [])), run.log.flatMap((l) => (l.raptured?.[1] ? [l.raptured[1]] : []))]}
          rivalName={tr("Computer")}
          forfeitLabel={tr("Forfeit")}
          onForfeit={() => {
            updateVault({ run: { ...run, result: 'loss' } });
            setTag(null);
          }}
          note={riding ? tr("Battles are off while you ride.") : undefined}
        />
      </main>
    );
  }

  if (cpuResult && run && run.result) {
    const paid = pay[run.id];
    const won = run.result === 'win';
    const lines: { label: string; rpm: number }[] = [];
    if (paid && paid.rpm > 0) {
      lines.push({ label: won ? tr("Battle won") : run.result === 'draw' ? tr("Battle drawn") : tr("Battle fought"), rpm: paid.rpm - paid.bonus });
      if (paid.bonus > 0) lines.push({ label: tr("First win of the day"), rpm: paid.bonus });
    }
    const mine = prize?.run === run.id ? prize : null;
    if (mine && mine.rpm > 0) lines.push({ label: tr("Prize already owned"), rpm: mine.rpm });
    const chosen = run.chosenReward ? (run.prizes ?? run.opponent).find((c) => c.id === run.chosenReward) : undefined;
    const forfeited = run.result === 'loss' && standing(run.hp[0]) > 0;
    return (
      <main className="text-foreground">
        <BattleResult
          outcome={run.result}
          summary={
            forfeited
              ? tr("You forfeited after {0} rounds.", [run.round])
              : run.result === 'draw' && standing(run.hp[0]) > 0
                ? tr("Stalemate after {0} rounds: the cards left were evenly matched, so nobody could land a hit.", [run.round])
                : tr("Rounds played: {0}. Cards left: you {1}, rival {2}.", [run.round, standing(run.hp[0]), standing(run.hp[1])])
          }
          pay={lines}
          note={
            demo
              ? tr("Demo mode: nothing is earned or saved.")
              : paid && paid.rpm === 0
                ? shop.rewardsLeft === 0
                  ? tr("Today's paid battles are used up, so this one paid no RPM.")
                  : tr("No RPM this time: battles pay at most once every half minute, and only when you're online.")
                : undefined
          }
          wear={wearBefore?.run === run.id ? run.player.map((card) => ({ card, change: conditionOf(vault.wear, card.id) - (wearBefore.before[card.id] ?? 100) })).filter((w) => w.change !== 0) : []}
          prize={chosen}
          prizeNote={mine?.had ? (mine.rpm > 0 ? tr("You already own this card, so it paid {0} RPM instead.", [mine.rpm]) : tr("You already own this one, so nothing new this time.")) : undefined}
          canLeave={!won || run.rewardClaimed}
          onAgain={riding || deck.length !== 5 || deckTags.length !== 3 ? undefined : startComputer}
          onDone={() => {
            updateVault({ run: null });
            setView('home');
          }}
        >
          {won && !run.rewardClaimed && <RewardShuffle key={run.id} run={run} riding={riding} onComplete={() => updateVault({ run: { ...run, rewardShuffleComplete: true } })} onClaim={claim} />}
        </BattleResult>
      </main>
    );
  }

  if (pvpBattle && shownOnline) {
    // The first rule set's server only told a car from a bike: its medic does more for a car, its Overdrive for a bike.
    const battleTags = V2 ? deckTags : deckTags.map((t) => ({ ...t, vehicle: t.power === 'heal' ? ('car' as const) : t.power === 'boost' ? ('bike' as const) : undefined }));
    return (
      <main className="cw-arena-page text-foreground">
        <BattleArena
          player={sideCards(shownOnline, true)}
          opponent={sideCards(shownOnline, false)}
          hp={[shownOnline.hp ?? [], shownOnline.rivalHp ?? []]}
          round={shownOnline.round ?? 1}
          disabled={busy || riding}
          submitted={!reveal && online?.submitted}
          selected={online?.selected}
          tags={battleTags}
          usedTags={battleTags.filter((t) => shownOnline.used?.includes(powerIndex(t.power))).map((t) => t.id)}
          tag={tag}
          onTag={setTag}
          onPick={(i) => void act('play', i)}
          reveal={reveal}
          onRevealEnd={finishReveal}
          penalty={shownOnline.penalty}
          gone={[
            (shownOnline.log ?? []).flatMap((l) => ((shownOnline.side === 1 ? l.r1 : l.r2) ? [(shownOnline.side === 1 ? l.r1 : l.r2) as string] : [])),
            (shownOnline.log ?? []).flatMap((l) => ((shownOnline.side === 1 ? l.r2 : l.r1) ? [(shownOnline.side === 1 ? l.r2 : l.r1) as string] : [])),
          ]}
          rivalName={tr("Rival")}
          forfeitLabel={tr("Forfeit: lose your stake")}
          onForfeit={() => void act('leave')}
          note={secondsLeft === null ? undefined : online?.submitted ? tr("Waiting for your rival · {0} s", [secondsLeft]) : tr("{0} s to play this round, or you forfeit", [secondsLeft])}
        />
      </main>
    );
  }

  if (pvpResult && online?.result) {
    const stake = online.stake ?? RULES.stake;
    const pot = stake === RULES.stake ? RULES.pot : 70;
    const early = standing(online.hp) > 0 && standing(online.rivalHp) > 0;
    const rounds = online.log?.length ?? 0;
    return (
      <main className="text-foreground">
        <BattleResult
          outcome={online.result}
          summary={
            early
              ? online.result === 'win'
                ? tr("Your rival left the battle or ran out of time.")
                : online.result === 'loss'
                  ? tr("You left the battle or ran out of time.")
                  : tr("The cards left were evenly matched, or time ran out.")
              : tr("Rounds played: {0}. Cards left: you {1}, rival {2}.", [rounds, standing(online.hp), standing(online.rivalHp)])
          }
          pay={online.result === 'win' ? [{ label: tr("Winner's pot"), rpm: pot }, { label: tr("Your stake"), rpm: -stake }] : online.result === 'loss' ? [{ label: tr("Your stake"), rpm: -stake }] : []}
          note={online.result === 'draw' ? tr("A draw: both stakes were handed back.") : undefined}
          wear={[]}
          canLeave
          onDone={() => {
            setOnline({ balance: online.balance });
            setDisplayOnline(null);
            seen.current = '';
            setCode('');
            setView('home');
            void refreshShop();
          }}
        />
      </main>
    );
  }

  if (view === 'shop') {
    return (
      <main className="text-foreground">
        <ShopPage onBack={() => setView('home')} disabled={riding} />
      </main>
    );
  }

  const why = riding
    ? tr("Battles are off while you ride.")
    : deck.length !== 5 || deckTags.length !== 3
      ? tr("Build your deck first: five cards and three dog tags.")
      : new Set(deck.map((c) => c.archetype)).size !== 5
        ? tr("Two of your cards battle with the same ratings. Swap one to battle a player.")
        : shop.balance !== null && shop.balance < RULES.stake
          ? tr("You need {0} RPM to battle a player.", [RULES.stake])
          : null;

  return (
    <main className="min-h-dvh flex flex-col p-4 safe-top safe-bottom max-w-3xl mx-auto w-full text-foreground">
      <PageHeader
        title={tr("Card Wars")}
        subtitle={tr("Real cars and bikes, card against card")}
        backTo="/arcade"
        right={
          <>
            <RpmPill balance={shop.balance} />
            <HeaderButton aria-label={tr("How to play")} onClick={() => setHelp(true)}>
              <HelpCircle className="w-5 h-5" />
            </HeaderButton>
          </>
        }
      />
      <Garage
        deck={deck}
        tags={deckTags}
        pool={wornPool}
        availableTags={tags}
        locked={locked}
        riding={riding}
        hours={hours}
        playersOpen={cap}
        onReplace={replaceSlot}
        onBestDeck={bestDeck}
        onBattleComputer={() => (run && !run.result ? setView('computer') : live ? (online?.status === 'playing' ? setView('players') : setSheet(true)) : startComputer())}
        onBattlePlayer={() => setSheet(true)}
        onShop={() => setView('shop')}
      />
      <PlayerBattleSheet
        open={sheet}
        onClose={() => setSheet(false)}
        online={online}
        code={code}
        onCode={setCode}
        busy={busy}
        why={why}
        secondsLeft={secondsLeft}
        onInvite={() => void act('create')}
        onJoin={() => void act('join')}
        onCancel={() => void act('leave')}
      />
      <HowToPlay open={help} onClose={() => setHelp(false)} players={cap} />
    </main>
  );
}
