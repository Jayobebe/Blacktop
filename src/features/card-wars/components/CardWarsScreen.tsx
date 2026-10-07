import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { HeaderButton, PageHeader } from '@/components/PageHeader';
import { useCollectedCards, useSpectreCards, useVehicleCards } from '@/features/cards';
import { useExperience } from '@/features/experience';
import { usePeaksHidden, useRideHistory, useRideSpeed } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { eventSound } from '@/lib/appSound';
import { demoBlocked } from '@/lib/demoGuard';
import { useDemoMode } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { warpScreen } from '@/lib/warp';
import { useServerCap } from '@/lib/serverCaps';
import { STARTER_TAGS, cardById, cardIdentity, unlockCard } from '../lib/catalog';
import { createRun, deadlocked, playRound } from '../lib/engine';
import { eventAt } from '../lib/events';
import { battleAction, type OnlineBattle } from '../lib/online';
import { bestFive, categoryLabel, deckRating } from '../lib/ratings';
import { matchOwn } from '../lib/ownMatch';
import { redlineById } from '../lib/redline';
import { ownRatings, ratingsArray, ratingsFrom } from '../lib/ownRatings';
import { computerFacts, onlineFacts, refreshProgress, reportContracts } from '../lib/progress';
import { LEVEL, RULES, dailyChallenge, showRpm } from '../lib/rules';
import { claimDaily, claimPrize, refreshShop, rewardOffline, setRpm, useShop, type BattlePay } from '../lib/shop';
import { claimReward, getVault, updateVault, useVault } from '../lib/store';
import { slotRef, tagStrength } from '../lib/tagRules';
import { allTags } from '../lib/tags';
import { conditionOf, flushPendingWear, queueWear, roundsFought, syncWear, wearAfterRun, withWear } from '../lib/wear';
import { CATEGORIES, POWERS, TAG_SLOTS, type BattleCard as Card, type Category, type CoinFlip, type DogTag, type Level, type QuickMode, type TagPower } from '../types';
import { BattleArena, type Reveal } from './BattleArena';
import { BattleResult } from './BattleResult';
import { Garage } from './Garage';
import { HowToPlay } from './HowToPlay';
import { PageTips } from '@/features/guide';
import { PlayerBattleSheet } from './PlayerBattleSheet';
import { RewardShuffle } from './RewardShuffle';
import { BattleSetupSheet, levelName, modeName } from './BattleSetupSheet';
import { QuickPlay } from './QuickPlay';
import { RpmPill } from './RpmPill';
import { ShopPage } from './ShopPage';
import { UnlockBox } from './UnlockBox';
import '../card-wars.css';

type View = 'home' | 'shop' | 'computer' | 'players' | 'quick';

const standing = (hp: number[] | undefined) => (hp ?? []).filter((v) => v > 0).length;
const powerAt = (index: number | null | undefined): TagPower | null => (typeof index === 'number' ? POWERS[index] ?? null : null);
const flipOf = (f: { h: boolean; c: number } | null | undefined): CoinFlip | null => (f && CATEGORIES[f.c - 1] ? { heads: !!f.h, category: CATEGORIES[f.c - 1] } : null);
/** The powers a player battle can carry: the Coin flip only where the server knows it. */
const ONLINE_POWERS = POWERS;

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
  const drives = useExperience().terms.car;
  const [params] = useSearchParams();
  const invited = params.get('battle') || '';

  // A battle against the computer that was left open (or its prize unpicked) comes straight back.
  const [view, setView] = useState<View>(vault.run ? 'computer' : 'home');
  /** A change of screen inside the game: the app's page warp, as between any two pages. */
  const go = (next: View) => {
    if (next !== view) warpScreen();
    setView(next);
  };
  const [setup, setSetup] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickMode | null>(null);
  // The daily challenge being set up: its day, so the battle carries it.
  const [quickDaily, setQuickDaily] = useState<{ day: string; theme: Category } | null>(null);
  const [sheet, setSheet] = useState(!!invited);
  const [help, setHelp] = useState(false);
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
    void refreshProgress();
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
    // A rider's own cards battle as the Road card nearest to the vehicle (ownMatch), lifted a little by their
    // riding, scaled by tier (ownRatings). Cards with hidden peaks can't be picked, as before. They wear like road cards.
    const matched: string[] = [];
    if (!peaksHidden) for (const c of own) {
      const b = matchOwn(c.bike.name, c.bike.makeModel, drives ? 'car' : 'bike', matched);
      matched.push(b.id);
      const figures = { topSpeedMph: c.stats.topSpeedMph, maxGForce: c.stats.maxGForce, maxLean: c.stats.maxLean, totalDistanceMi: c.stats.totalDistanceMi };
      cards.push({ ...b, ...cardIdentity(c.bike.name, c.bike.makeModel), id: `own:${c.bike.id}`, name: c.bike.name || b.name, image: c.bike.photos.hero || undefined, tier: c.tier, spec: 'factory', source: 'collection', ratings: ownRatings(b, figures, c.tier) });
    }
    // Scanned rider cards: what their QR shares, under the same tier rules.
    for (const c of collected) {
      if (c.s?.topSpeedMph == null || c.s?.maxGForce == null) continue;
      const b = matchOwn(c.n, c.m, 'bike', matched);
      matched.push(b.id);
      const figures = c.s ? { topSpeedMph: c.s.topSpeedMph, maxGForce: c.s.maxGForce, maxLean: c.s.maxLean, totalDistanceMi: c.s.totalDistanceMi } : null;
      cards.push({ ...b, ...cardIdentity(c.n, c.m), id: `collected:${c.key}`, name: c.n, image: c.img, tier: c.t, spec: 'factory', source: 'collection', ratings: ownRatings(b, figures, c.t) });
    }
    return cards;
  }, [vault.rewards, vault.unlocks, own, collected, peaksHidden, shop.owned, drives]);

  const tags = useMemo(() => allTags(shop.tags, spectres, shop.wildcard), [shop.tags, spectres, shop.wildcard]);
  // The Redline wheel: what a Wildcard in the deck can land on.
  const wheel = useMemo(() => shop.wheel.map((id) => redlineById(id)).filter((c): c is Card => !!c), [shop.wheel]);
  const wornPool = useMemo(() => pool.map((c) => withWear(c, conditionOf(vault.wear, c.id))), [pool, vault.wear]);
  const deck = vault.deck.map((id) => wornPool.find((c) => c.id === id)).filter((c): c is Card => !!c);
  // Three dog tags: any three under builds (two or three of a power is a build like any other), each a
  // different power before. A tag that's gone (won on another phone, say) gives its slot to a standard one.
  const deckTags = vault.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is DogTag => !!t)
    .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i)
    .slice(0, TAG_SLOTS);
  for (const spare of STARTER_TAGS) if (deckTags.length < TAG_SLOTS && !deckTags.some((t) => t.id === spare.id)) deckTags.push(spare);
  const run = vault.run;

  // The Arcade page shows the deck without opening the game: keep a light copy with the vault
  // (no photos: a rider's own are data URLs, far too big to store twice).
  const summary = useMemo(
    () =>
      JSON.stringify({
        cards: deck.map((c) => ({ ...c, condition: undefined, image: c.image?.startsWith('data:') ? undefined : c.image })),
        tags: deckTags.map(({ spectre: _s, ...t }) => t),
        rating: deckRating(vault.deck.map((id) => pool.find((c) => c.id === id)).filter((c): c is Card => !!c)),
      }),
    // The ids say when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vault.deck.join(), deckTags.map((t) => t.id).join(), pool.length],
  );
  useEffect(() => {
    if (demo || !deck.length) return;
    if (JSON.stringify(getVault().summary) !== summary) updateVault({ summary: JSON.parse(summary) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, demo]);
  const armed = deckTags.find((t) => t.id === tag);
  const today = dailyChallenge(clock);

  // ── A finished battle against the computer: RPM, then wear ──
  useEffect(() => {
    const r = vault.run;
    if (!r || !r.result || vault.rpmApplied === r.id || demo) return;
    updateVault({ rpmApplied: r.id });
    void reportContracts(r.id, computerFacts(r, r.player.every((c) => (c.condition ?? 100) >= 100))).then((earned) => {
      if (earned > 0) toast.success(tr("Contract complete: +{0} RPM", [showRpm(earned)]));
    });
    void rewardOffline(r.result, r.level).then(async (paid) => {
      // Today's challenge, won: its bonus comes on top, once.
      const claim = r.daily && r.result === 'win' && r.daily === dailyChallenge().day ? await claimDaily() : null;
      const daily = claim?.rpm ?? 0;
      const red = redlineById(claim?.redline);
      if (red) toast.success(tr("A new Redline card: {0} {1}", [red.manufacturer ?? '', red.name]), { description: tr("Put it on your wheel from the deck page.") });
      setPay((all) => ({ ...all, [r.id]: { ...paid, daily } }));
      if (paid.rpm + daily > 0) eventSound('coin');
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
      go('players');
    } else if (online?.status === 'cancelled') {
      toast(tr("Invitation closed. Your {0} RPM is back.", [showRpm(online.stake ?? RULES.stake)]));
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
    void reportContracts(online.code, onlineFacts(online, deck.every((c) => (c.condition ?? 100) >= 100))).then((earned) => {
      if (earned > 0) toast.success(tr("Contract complete: +{0} RPM", [showRpm(earned)]));
    });
    // Once per finished battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.status, online?.code]);

  /** A card in a player battle: the catalog card the server is comparing, at its condition, under the rider's own name where it's theirs. */
  const battleCard = (id: string, condition: number, mine: boolean, rated?: number[] | null): Card | null => {
    const catalog = cardById(id);
    if (!catalog) return null;
    const lifted = ratingsFrom(rated);
    const base = lifted ? { ...catalog, ratings: lifted } : catalog;
    const worn = withWear(base, condition);
    const ownCard = mine ? deck.find((c) => c.archetype === id && c.id !== id) : undefined;
    return ownCard ? { ...worn, name: ownCard.name, manufacturer: ownCard.manufacturer, image: ownCard.image, tier: ownCard.tier, displayVehicle: base.vehicle, source: 'collection' } : worn;
  };
  const sideCards = (b: OnlineBattle | null, mine: boolean): Card[] =>
    ((mine ? b?.deck : b?.rivalDeck) ?? []).flatMap((id, i) => battleCard(id, (mine ? b?.wear?.[i] : b?.rivalWear?.[i]) ?? (mine ? conditionOf(vault.wear, id) : 100), mine, (mine ? b?.ratings : b?.rivalRatings)?.[i]) ?? []);

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
          flips: last.f1 || last.f2 ? (first ? [flipOf(last.f1), flipOf(last.f2)] : [flipOf(last.f2), flipOf(last.f1)]) : undefined,
          raptured: last.r1 || last.r2 ? (first ? [last.r1 ?? null, last.r2 ?? null] : [last.r2 ?? null, last.r1 ?? null]) : undefined,
          ...(last.w1 || last.w2 ? { wild: [redlineById(first ? last.w1 : last.w2) ?? null, redlineById(first ? last.w2 : last.w1) ?? null] as [Card | null, Card | null], wheel } : {}),
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
              // Own and scanned cards carry their ratings from riding (never the figures behind them).
              own: deck.map((c) => {
                const fresh = pool.find((p) => p.id === c.id);
                return fresh && c.source === 'collection' ? { key: c.id, r: ratingsArray(fresh.ratings) } : null;
              }),
              // Three slots, "power:ref" each.
              tags: Array.from({ length: TAG_SLOTS }, (_, i) => slotRef(deckTags[i])),
            }
          : {}),
        ...(action === 'play' ? { card, tag: armed ? deckTags.indexOf(armed) : undefined, round: online?.round } : {}),
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
    const theirIndex = next.opponent.findIndex((c) => c.id === last.opponent);
    if (last.rivalTag === 'heal' && theirIndex >= 0) before[1][theirIndex] = Math.min(100, before[1][theirIndex] + tagStrength({ power: 'heal' }, opponent));
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
      tags: [last.tag ?? null, last.rivalTag ?? null],
      event: last.event ?? null,
      raptured: last.raptured,
      flips: last.flips,
      ...(last.wild && redlineById(last.wild) ? { wild: [redlineById(last.wild)!, null] as [Card, null], wheel: next.wheel } : {}),
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
    // One tag per power, before builds.
    values[index] = id;
    updateVault({ [type]: values });
  }

  /** The five strongest cards as they are now, different ratings first (a player battle needs five different). */
  function bestDeck() {
    if (riding || locked) return;
    updateVault({ deck: bestFive(wornPool).map((c) => c.id) });
  }

  /** Fields these five (the Potential deck). */
  function fieldDeck(ids: string[]) {
    if (riding || locked || ids.length !== 5 || ids.some((id) => !wornPool.some((c) => c.id === id))) return;
    updateVault({ deck: ids });
  }

  function startComputer(level?: Level) {
    if (riding || locked || deck.length !== 5 || deckTags.length !== TAG_SLOTS) return;
    setTag(null);
    setReveal(null);
    setSetup(false);
    updateVault({ run: createRun(deck, Math.random, { level: level ?? 'medium', wheel }) });
    go('computer');
  }

  /** Quick play: a deck built for the theme, for this battle only, at hard. */
  function startQuick(cards: Card[], theme: Category, mode: QuickMode) {
    if (riding || locked || cards.length !== 5) return;
    setTag(null);
    setReveal(null);
    updateVault({ run: createRun(cards, Math.random, { level: 'hard', mode, theme, wheel, ...(quickDaily ? { daily: quickDaily.day } : {}) }) });
    setQuickDaily(null);
    go('computer');
  }

  /** Battle again: back to the level sheet. */
  const again = () => {
    updateVault({ run: null });
    go('home');
    setSetup(true);
  };

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
          rivalTags={run.rivalUsed && run.mode !== 'bare' ? (['boost', 'heal', 'reroll'] as const).map((power) => ({ power, used: run.rivalUsed!.includes(power) })) : undefined}
          rounds={run.player.map((c) => roundsFought(run)[c.id] ?? 0)}
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
          note={riding ? tr("Battles are off while you ride.") : run.theme ? tr("{0} · theme: {1}", [modeName(run.mode ?? 'themed'), categoryLabel(run.theme)]) : run.level ? levelName(run.level) : undefined}
        />
      </main>
    );
  }

  if (cpuResult && run && run.result) {
    const paid = pay[run.id];
    const won = run.result === 'win';
    const lines: { label: string; rpm: number }[] = [];
    if (paid && paid.rpm > 0) {
      const streakBonus = paid.streakBonus ?? 0;
      lines.push({ label: won ? tr("Battle won") : run.result === 'draw' ? tr("Battle drawn") : tr("Battle fought"), rpm: paid.rpm - paid.bonus - streakBonus });
      if (paid.bonus > 0) lines.push({ label: tr("First win of the day"), rpm: paid.bonus });
      if (streakBonus > 0) lines.push({ label: tr("{0} wins in a row", [paid.streak ?? 0]), rpm: streakBonus });
    }
    if (paid?.daily) lines.push({ label: tr("Daily challenge"), rpm: paid.daily });
    const mine = prize?.run === run.id ? prize : null;
    if (mine && mine.rpm > 0) lines.push({ label: tr("Prize already owned"), rpm: mine.rpm });
    const chosen = run.chosenReward ? (run.prizes ?? run.opponent).find((c) => c.id === run.chosenReward) : undefined;
    const forfeited = run.result === 'loss' && standing(run.hp[0]) > 0;
    // A win picks a prize card on hard only (and in every battle from before levels).
    const prizeDue = !run.level || LEVEL[run.level].prize;
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
              : run.level === 'easy'
                ? tr("Easy is practice: no RPM and no prize card, and your cards wore a third as much.")
                : run.level === 'medium' && paid && paid.rpm > 0
                  ? tr("Medium pays half and wins no prize card. Hard pays in full.")
                  : paid && paid.rpm === 0
                ? shop.rewardsLeft === 0
                  ? tr("Today's paid battles are used up, so this one paid no RPM.")
                  : tr("No RPM this time: battles pay at most once every half minute, and only when you're online.")
                : undefined
          }
          wear={
            wearBefore?.run === run.id
              ? run.player
                  .map((card) => ({ card, change: conditionOf(vault.wear, card.id) - (wearBefore.before[card.id] ?? 100), rounds: roundsFought(run)[card.id] }))
                  .filter((w) => w.change !== 0)
              : []
          }
          prize={chosen}
          prizeNote={mine?.had ? (mine.rpm > 0 ? tr("You already own this card, so it paid {0} RPM instead.", [showRpm(mine.rpm)]) : tr("You already own this one, so nothing new this time.")) : undefined}
          canLeave={!won || !prizeDue || run.rewardClaimed}
          onAgain={riding || deck.length !== 5 || deckTags.length !== TAG_SLOTS ? undefined : again}
          onDone={() => {
            updateVault({ run: null });
            go('home');
          }}
        >
          {won && prizeDue && !run.rewardClaimed && <RewardShuffle key={run.id} run={run} riding={riding} onComplete={() => updateVault({ run: { ...run, rewardShuffleComplete: true } })} onClaim={claim} />}
        </BattleResult>
      </main>
    );
  }

  if (pvpBattle && shownOnline) {
    const battleTags = deckTags.filter((t) => (ONLINE_POWERS as readonly TagPower[]).includes(t.power));
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
          usedTags={battleTags.filter((t, i) => shownOnline.used?.includes(i)).map((t) => t.id)}
          rounds={sideCards(shownOnline, true).map((c) => (shownOnline.log ?? []).filter((l) => (shownOnline.side === 1 ? l.card1 : l.card2) === c.id).length)}
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
            go('home');
            void refreshShop();
          }}
        />
      </main>
    );
  }

  if (view === 'quick' && quickMode && !locked) {
    return (
      <main className="text-foreground">
        <QuickPlay
          key={quickMode}
          mode={quickMode}
          pool={wornPool}
          fixedTheme={quickDaily?.theme}
          onStart={(cards, theme) => startQuick(cards, theme, quickMode)}
          onCancel={() => {
            setQuickDaily(null);
            go('home');
            setSetup(true);
          }}
        />
      </main>
    );
  }

  if (view === 'shop') {
    return (
      <main className="text-foreground">
        <ShopPage onBack={() => go('home')} disabled={riding} />
      </main>
    );
  }

  const why = riding
    ? tr("Battles are off while you ride.")
    : deck.length !== 5 || deckTags.length !== TAG_SLOTS
      ? tr("Build your deck first: five cards and three dog tags.")
      : new Set(deck.map((c) => c.archetype)).size !== 5
        ? tr("Two of your cards battle with the same ratings. Swap one to battle a player.")
        : shop.balance !== null && shop.balance < RULES.stake
          ? tr("You need {0} RPM to battle a player.", [showRpm(RULES.stake)])
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
            <HeaderButton data-tip="cw-help" aria-label={tr("How to play")} onClick={() => setHelp(true)}>
              <HelpCircle className="w-5 h-5" />
            </HeaderButton>
          </>
        }
      />
      <UnlockBox />
      <Garage
        deck={deck}
        tags={deckTags}
        pool={wornPool}
        basePool={pool}
        availableTags={tags}
        locked={locked}
        riding={riding}
        hours={hours}
        playersOpen={cap}
        onReplace={replaceSlot}
        onBestDeck={bestDeck}
        onFieldDeck={fieldDeck}
        onBattleComputer={() => (run && !run.result ? go('computer') : live ? (online?.status === 'playing' ? go('players') : setSheet(true)) : setSetup(true))}
        onBattlePlayer={() => setSheet(true)}
        onShop={() => go('shop')}
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
      <BattleSetupSheet
        open={setup}
        onClose={() => setSetup(false)}
        onLevel={(level) => startComputer(level)}
        canQuick={wornPool.length >= 5 && deckTags.length === TAG_SLOTS}
        onQuick={(mode) => {
          setSetup(false);
          setQuickDaily(null);
          setQuickMode(mode);
          go('quick');
        }}
        streak={!demo ? shop.streak : undefined}
        daily={!demo ? { theme: today.theme, mode: today.mode, done: shop.dailyDone } : undefined}
        onDaily={() => {
          setSetup(false);
          setQuickDaily({ day: today.day, theme: today.theme });
          setQuickMode(today.mode);
          go('quick');
        }}
      />
      <HowToPlay open={help} onClose={() => setHelp(false)} players={cap} />
      {/* First-time tips for the game's home (the rules themselves are behind the ? button, which the last tip points at). */}
      <PageTips
        page="card-wars"
        scroll
        max={4}
        when={!help && !setup && !sheet}
        tips={[
          { target: '[data-tip="cw-rating"]', text: tr("Your deck's strength. The small number beside it is what your dog tags add.") },
          { target: '[data-tip="cw-deck"]', text: tr("Tap a card to look at it, swap it out or repair it. Cards wear as they fight: rest them or repair them.") },
          { target: '[data-tip="cw-battle"]', text: tr("Pick how hard the computer plays. Hard pays the most and wins you a prize card. The daily challenge is in here too.") },
          { target: '[data-tip="cw-help"]', text: tr("The full rules are behind this button whenever you want them.") },
        ]}
      />
    </main>
  );
}
