import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive, useDemoMode } from '@/lib/demoMode';
import { STARTERS, type ShopCategory } from './catalog';
import { RULES, V2 } from './rules';
import { getVault, updateVault } from './store';
import { flushPendingWear } from './wear';

/**
 * RPM, owned cards and dog tags, free and bonus spins, and today's battle
 * rewards: all held by the server. This store only shows what it last said.
 */
export interface ShopState {
  balance: number | null;
  owned: string[];
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
}

export interface SpinResult {
  kind: 'card' | 'tag' | 'duplicate' | 'rpm' | 'spins';
  card: string | null;
  /** The dog tag won, as "power:card". */
  tag?: string | null;
  category: ShopCategory;
  rpm: number;
  spins: number;
}

const EMPTY: ShopState = { balance: null, owned: [], freeSpins: 0, freeTagSpins: 0, spins: {}, tags: [], rewardsLeft: null, firstWin: false };

/** Demo mode: a small collection to play with. Nothing here reaches the server. */
const DEMO_SHOP: ShopState = {
  balance: 260,
  owned: [...STARTERS, '911', 'civic', 'panigale', 'gs', 'striple', 'gt3r', 'r6', 'rsr19'],
  freeSpins: 0,
  freeTagSpins: 0,
  spins: {},
  tags: ['boost:panigale', 'heal:gs', 'reroll:gt3r', 'boost:rsr19'],
  rewardsLeft: RULES.dailyBattles === null ? null : RULES.dailyBattles - 6,
  firstWin: false,
};

let state: ShopState = EMPTY;
const listeners = new Set<() => void>();
const set = (s: ShopState) => {
  state = s;
  listeners.forEach((l) => l());
};

type Raw = Partial<{ balance: number; owned: string[]; freeSpins: number; freeTagSpins: number; spins: Record<string, number>; tags: string[]; rewardsLeft: number; firstWin: boolean }>;
/** Takes whatever the server sent: an older server leaves the newer fields out. */
const apply = (d: Raw) =>
  set({
    balance: typeof d.balance === 'number' ? d.balance : state.balance,
    owned: d.owned ?? state.owned,
    freeSpins: d.freeSpins ?? 0,
    freeTagSpins: d.freeTagSpins ?? 0,
    spins: d.spins ?? {},
    tags: d.tags ?? [],
    rewardsLeft: typeof d.rewardsLeft === 'number' ? d.rewardsLeft : null,
    firstWin: !!d.firstWin,
  });
const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);

export async function refreshShop() {
  if (isDemoModeActive()) return;
  const { data, error } = await rpc('cw_shop');
  if (!error && data) apply(data as Raw);
}

export function setRpm(balance: number) {
  if (state.balance !== balance) set({ ...state, balance });
}

export async function buyCard(id: string): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_buy', { _card: id });
  if (error) return error.message;
  set({ ...state, balance: (data as { balance: number }).balance, owned: Array.from(new Set([...state.owned, id])) });
  return null;
}

/** One spin: paid or bonus on a shelf, or (null) one of the free spins that always lands a card. */
export async function spin(category: ShopCategory | null): Promise<SpinResult | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_spin', { _cat: category ?? 'road', _free: category === null });
  if (error) return error.message;
  const d = data as SpinResult & Raw;
  apply(d);
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
}

/** RPM for a finished battle against the computer. The server paces it and counts the day's battles. */
export async function rewardOffline(result: 'win' | 'draw' | 'loss'): Promise<BattlePay> {
  if (isDemoModeActive()) return { rpm: 0, bonus: 0 };
  const { data, error } = await rpc('cw_reward_offline', { _result: result });
  if (error || !data) return { rpm: 0, bonus: 0 };
  const d = data as { rpm: number; bonus?: number; balance: number; left?: number };
  set({ ...state, balance: d.balance, rewardsLeft: typeof d.left === 'number' ? d.left : state.rewardsLeft, firstWin: state.firstWin && !(d.bonus && d.bonus > 0) });
  return { rpm: d.rpm, bonus: d.bonus ?? 0 };
}

/**
 * Tells the server which prize was picked after beating the computer, so the
 * card is owned on every phone (and a card already owned pays RPM instead).
 * The phone keeps the prize whatever the server says; null when it said nothing.
 */
export async function claimPrize(card: string): Promise<{ kind: 'card' | 'duplicate'; rpm: number } | null> {
  if (!V2 || isDemoModeActive()) return null;
  const { data, error } = await rpc('cw_claim_prize', { _card: card });
  if (error || !data) return null;
  const d = data as { kind: 'card' | 'duplicate'; rpm: number } & Raw;
  apply(d);
  return { kind: d.kind, rpm: d.rpm };
}

/** Restores a worn card to 100% condition. Server-checked; the price is rules.ts `repairCost`. */
export async function repairCard(id: string): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  if (!(await flushPendingWear())) return 'Condition save pending';
  const { data, error } = await rpc('cw_repair', { _card: id });
  const markNew = () => updateVault({ wear: { ...(getVault().wear || {}), [id]: 100 } });
  // The server holds no wear for this card: it's already at 100%, so drop the stale local figure.
  if (error) {
    if (error.message.includes('not worn')) {
      markNew();
      return null;
    }
    return error.message;
  }
  setRpm((data as { balance: number }).balance);
  markNew();
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
