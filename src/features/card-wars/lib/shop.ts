import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive, useDemoMode } from '@/lib/demoMode';
import { hasServerCap } from '@/lib/serverCaps';
import { STARTERS, type ShopCategory } from './catalog';
import { REDLINES } from './redline';
import { COPIES, RULES } from './rules';
import type { Level } from '../types';
import { getVault, updateVault } from './store';
import { flushPendingWear } from './wear';

/**
 * RPM, owned cards and dog tags, free and bonus spins, and today's battle
 * rewards: all held by the server. This store only shows what it last said.
 */
export interface ShopState {
  balance: number | null;
  owned: string[];
  /** Cards held more than once, and how many times (the market rules; nothing here before them). */
  copies: Record<string, number>;
  /** Marketplace sales still open today (null: the server doesn't say). */
  marketLeft: number | null;
  /** Free spins left for cards, and for dog tags. */
  freeSpins: number;
  freeTagSpins: number;
  /** Bonus spins won on a shelf. */
  spins: Partial<Record<ShopCategory, number>>;
  /** Dog tags won on spins, as "power:card". */
  tags: string[];
  /** Computer battles that still pay RPM today (null: no limit). */
  rewardsLeft: number | null;
  /** The first-win bonus is still to be had today. */
  firstWin: boolean;
  /** Hard wins in a row (the server's count), and whether today's challenge has been won. */
  streak: number;
  dailyDone: boolean;
  /** Redline: the Wildcard dog tag is held, the Redline cards collected, the five on the wheel, and paid F1 / MotoGP spins so far without the Wildcard. */
  wildcard: boolean;
  redlines: string[];
  wheel: string[];
  wildPity: number;
}

export interface SpinResult {
  kind: 'card' | 'tag' | 'duplicate' | 'rpm' | 'spins' | 'wildcard';
  /** The Redline cards that came with the Wildcard. */
  redlines?: string[] | null;
  card: string | null;
  /** The dog tag won, as "power:card". */
  tag?: string | null;
  category: ShopCategory;
  rpm: number;
  spins: number;
}

const EMPTY: ShopState = { balance: null, owned: [], copies: {}, marketLeft: null, freeSpins: 0, freeTagSpins: 0, spins: {}, tags: [], rewardsLeft: null, firstWin: false, streak: 0, dailyDone: false, wildcard: false, redlines: [], wheel: [], wildPity: 0 };

/** Demo mode: a small collection to play with. Nothing here reaches the server. */
const DEMO_SHOP: ShopState = {
  balance: 260,
  owned: [...STARTERS, '911', 'civic', 'panigale', 'gs', 'striple', 'gt3r', 'r6', 'rsr19'],
  copies: { '911': 2, civic: 3 },
  marketLeft: 3,
  freeSpins: 0,
  freeTagSpins: 0,
  spins: {},
  tags: ['boost:panigale', 'heal:gs', 'reroll:gt3r', 'boost:rsr19'],
  rewardsLeft: RULES.dailyBattles === null ? null : RULES.dailyBattles - 6,
  firstWin: false,
  streak: 0,
  dailyDone: false,
  wildcard: true,
  redlines: REDLINES.slice(0, 7).map((c) => c.id),
  wheel: REDLINES.slice(0, 5).map((c) => c.id),
  wildPity: 0,
};

let state: ShopState = EMPTY;
const listeners = new Set<() => void>();
const set = (s: ShopState) => {
  state = s;
  listeners.forEach((l) => l());
};

type Raw = Partial<{ balance: number; owned: string[]; copies: Record<string, number>; marketLeft: number; freeSpins: number; freeTagSpins: number; spins: Record<string, number>; tags: string[]; rewardsLeft: number; firstWin: boolean }>;
/** Takes whatever the server sent: an older server leaves the newer fields out. */
const apply = (d: Raw) =>
  set({
    balance: typeof d.balance === 'number' ? d.balance : state.balance,
    owned: d.owned ?? state.owned,
    copies: d.copies ?? (d.owned ? {} : state.copies),
    marketLeft: typeof d.marketLeft === 'number' ? d.marketLeft : state.marketLeft,
    freeSpins: d.freeSpins ?? 0,
    freeTagSpins: d.freeTagSpins ?? 0,
    spins: d.spins ?? {},
    tags: d.tags ?? [],
    rewardsLeft: typeof d.rewardsLeft === 'number' ? d.rewardsLeft : null,
    firstWin: !!d.firstWin,
    streak: state.streak,
    dailyDone: state.dailyDone,
    wildcard: state.wildcard,
    redlines: state.redlines,
    wheel: state.wheel,
    wildPity: state.wildPity,
  });

type RedlineRaw = Partial<{ wildcard: boolean; pity: number; wheel: string[]; owned: string[] }>;
const applyRedline = (d: RedlineRaw | null) => {
  if (!d) return;
  set({ ...state, wildcard: !!d.wildcard, redlines: d.owned ?? [], wheel: d.wheel ?? [], wildPity: d.pity ?? 0 });
};
/** What the server holds of the player's Redline cards and Wildcard (nothing before the Redline migration). */
export async function refreshRedline() {
  if (isDemoModeActive() || !hasServerCap('cardWarsRedline')) return;
  const { data, error } = await rpc('cw_redline_state');
  if (!error) applyRedline(data as RedlineRaw);
}

/** Puts these five Redline cards on the wheel. A string is the server's refusal. */
export async function setWheel(ids: string[]): Promise<string | null> {
  // Demo mode: the sample wheel can be rearranged, in memory only.
  if (isDemoModeActive()) {
    set({ ...state, wheel: ids });
    return null;
  }
  const { data, error } = await rpc('cw_redline_wheel_set', { _cards: ids });
  if (error) return error.message;
  applyRedline(data as RedlineRaw);
  return null;
}

/** An influencer build's code. The card it gave (null: no such code), or a string refusal. */
export async function redeemRedline(code: string): Promise<{ card: string | null; fresh: boolean } | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_redline_redeem', { _code: code });
  if (error) return error.message;
  const d = data as RedlineRaw & { card: string | null; fresh?: boolean };
  applyRedline(d);
  return { card: d.card ?? null, fresh: !!d.fresh };
}
const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);

export async function refreshShop() {
  if (isDemoModeActive()) return;
  const { data, error } = await rpc('cw_shop');
  if (!error && data) apply(data as Raw);
  const extra = await rpc('cw_daily_state');
  const d = extra.data as { streak?: number; dailyDone?: boolean } | null;
  if (!extra.error && d) set({ ...state, streak: d.streak ?? 0, dailyDone: !!d.dailyDone });
  await refreshRedline();
}

export function setRpm(balance: number) {
  if (state.balance !== balance) set({ ...state, balance });
}

export async function buyCard(id: string): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_buy', { _card: id });
  if (error) return error.message;
  // Another copy of a card already held counts up; the first is just owned.
  const had = state.owned.includes(id);
  set({
    ...state,
    balance: (data as { balance: number }).balance,
    owned: Array.from(new Set([...state.owned, id])),
    copies: had ? { ...state.copies, [id]: Math.min(COPIES.most, (state.copies[id] ?? 1) + 1) } : state.copies,
  });
  return null;
}

/** Cards that have left the collection for good (sold or traded up) leave the phone's own lists too. */
function forget(ids: string[]) {
  const gone = ids.filter((id) => !state.owned.includes(id));
  if (!gone.length) return;
  const v = getVault();
  updateVault({ rewards: v.rewards.filter((id) => !gone.includes(id)), deck: v.deck.filter((id) => !gone.includes(id)) });
}

/** The Blacktop Marketplace: one card to the house on a coin flip (heads the better price). A string is its refusal. */
export async function sellCard(id: string): Promise<{ heads: boolean; rpm: number } | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_market_sell', { _card: id });
  if (error) return error.message;
  const d = data as { heads: boolean; rpm: number } & Raw;
  apply(d);
  forget([id]);
  return { heads: !!d.heads, rpm: d.rpm };
}

/** Five cards of one tier for one spin at the tier above (a card named once for each copy given). */
export async function tradeUp(ids: string[]): Promise<SpinResult | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_trade_up', { _cards: ids });
  if (error) return error.message;
  const d = data as SpinResult & Raw;
  apply(d);
  forget(ids);
  return d;
}

/** One spin: paid or bonus on a shelf, or (null) one of the free spins that always lands a card. */
export async function spin(category: ShopCategory | null): Promise<SpinResult | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_spin', { _cat: category ?? 'road', _free: category === null });
  if (error) return error.message;
  const d = data as SpinResult & Raw;
  apply(d);
  // A paid F1 or MotoGP spin moves the Wildcard's count, or lands it.
  if (category === 'f1' || category === 'motogp') await refreshRedline();
  return d;
}

/** One of the free dog tag spins: always a tag, of a power the player has none of yet. */
export async function spinTag(): Promise<SpinResult | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_spin_tag');
  if (error) return error.message;
  const d = data as SpinResult & Raw;
  apply(d);
  return d;
}

export interface BattlePay {
  /** RPM paid, the first-win bonus included. */
  rpm: number;
  bonus: number;
  /** Hard wins in a row after this one, and what the streak added (in `rpm` too). */
  streak?: number;
  streakBonus?: number;
  /** The daily challenge, when this battle won it. */
  daily?: number;
}

/** RPM for a finished battle against the computer. The server paces it and counts the day's battles. */
export async function rewardOffline(result: 'win' | 'draw' | 'loss', level?: Level): Promise<BattlePay> {
  if (isDemoModeActive()) return { rpm: 0, bonus: 0 };
  // The level sets the pay (easy none, medium half, hard all of it) where the server knows levels.
  const { data, error } = level ? await rpc('cw_reward_battle', { _result: result, _level: level }) : await rpc('cw_reward_offline', { _result: result });
  if (error || !data) return { rpm: 0, bonus: 0 };
  const d = data as { rpm: number; bonus?: number; balance: number; left?: number; streak?: number; streakBonus?: number };
  set({ ...state, balance: d.balance, rewardsLeft: typeof d.left === 'number' ? d.left : state.rewardsLeft, firstWin: state.firstWin && !(d.bonus && d.bonus > 0), streak: typeof d.streak === 'number' ? d.streak : state.streak });
  return { rpm: d.rpm, bonus: d.bonus ?? 0, streak: d.streak, streakBonus: d.streakBonus ?? 0 };
}

/** The daily challenge, won: pays once a day (0 when today's is already paid, or the server didn't answer). */
export async function claimDaily(): Promise<{ rpm: number; redline: string | null }> {
  if (isDemoModeActive()) return { rpm: 0, redline: null };
  const { data, error } = await rpc('cw_daily_claim');
  if (error || !data) return { rpm: 0, redline: null };
  const d = data as { rpm: number; balance: number; redline?: string | null };
  // A Wildcard holder's daily win can bring another Redline card.
  set({ ...state, balance: d.balance, dailyDone: true, redlines: d.redline && !state.redlines.includes(d.redline) ? [...state.redlines, d.redline] : state.redlines });
  return { rpm: d.rpm, redline: d.redline ?? null };
}

/**
 * Tells the server which prize was picked after beating the computer, so the
 * card is owned on every phone (and a card already owned pays RPM instead).
 * The phone keeps the prize whatever the server says; null when it said nothing.
 */
export async function claimPrize(card: string): Promise<{ kind: 'card' | 'duplicate'; rpm: number } | null> {
  if (isDemoModeActive()) return null;
  const { data, error } = await rpc('cw_claim_prize', { _card: card });
  if (error || !data) return null;
  const d = data as { kind: 'card' | 'duplicate'; rpm: number } & Raw;
  apply(d);
  return { kind: d.kind, rpm: d.rpm };
}

/**
 * RPM for a finished game elsewhere in the arcade (Hit Heavy, Petrol Head): a
 * little for playing, more for a personal best, capped a day by the server.
 * Null when there's nothing to say (no server for it yet, demo mode, offline).
 */
export async function arcadeReward(game: 'hit-heavy' | 'petrol-head', best: boolean): Promise<number | null> {
  if (isDemoModeActive()) return null;
  const { data, error } = await rpc('cw_arcade_reward', { _game: game, _best: best });
  if (error || !data) return null;
  const d = data as { rpm: number; balance: number };
  if (typeof d.balance === 'number') setRpm(d.balance);
  return d.rpm;
}

/** Restores a worn card to 100% condition, or to `to` (60, the part repair). Server-checked; the price is rules.ts `repairCost`. */
export async function repairCard(id: string, to = 100): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  if (!(await flushPendingWear())) return 'Condition save pending';
  // The full repair goes out as it always has, so a server without the part repair still takes it.
  const { data, error } = await rpc('cw_repair', to === 100 ? { _card: id } : { _card: id, _to: to });
  const markNew = (at = 100) => updateVault({ wear: { ...(getVault().wear || {}), [id]: at } });
  // The server holds no wear for this card: it's already at 100%, so drop the stale local figure.
  if (error) {
    if (error.message.includes('not worn')) {
      markNew();
      return null;
    }
    return error.message;
  }
  setRpm((data as { balance: number }).balance);
  markNew(to);
  return null;
}

export function useShop(): ShopState {
  const real = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  return useDemoMode().enabled ? DEMO_SHOP : real;
}
