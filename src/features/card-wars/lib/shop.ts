import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive } from '@/lib/demoMode';
import type { ShopCategory } from './catalog';

/** RPM, owned cards, free starter spins and bonus spins: all held by the server. */
export interface ShopState { balance: number | null; owned: string[]; freeSpins: number; spins: Partial<Record<ShopCategory, number>> }
export interface SpinResult { kind: 'card' | 'duplicate' | 'rpm' | 'spins'; card: string | null; category: ShopCategory; rpm: number; spins: number }
let state: ShopState = { balance: null, owned: [], freeSpins: 0, spins: {} };
const listeners = new Set<() => void>();
const set = (s: ShopState) => { state = s; listeners.forEach(l => l()); };
type Raw = { balance: number; owned: string[]; freeSpins: number; spins: Record<string, number> };
const apply = (d: Raw) => set({ balance: d.balance, owned: d.owned ?? [], freeSpins: d.freeSpins ?? 0, spins: d.spins ?? {} });
const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);

export async function refreshShop() {
 if (isDemoModeActive()) return;
 const { data, error } = await rpc('cw_shop');
 if (!error && data) apply(data as Raw);
}
export function setRpm(balance: number) { if (state.balance !== balance) set({ ...state, balance }); }
export async function buyCard(id: string): Promise<string | null> {
 if (demoBlocked()) return 'demo';
 const { data, error } = await rpc('cw_buy', { _card: id });
 if (error) return error.message;
 set({ ...state, balance: (data as { balance: number }).balance, owned: Array.from(new Set([...state.owned, id])) });
 return null;
}
/** One spin: paid / bonus for a category, or a free starter spin for an empty deck slot. */
export async function spin(category: ShopCategory | null): Promise<SpinResult | string> {
 if (demoBlocked()) return 'demo';
 const { data, error } = await rpc('cw_spin', { _cat: category ?? 'road', _free: category === null });
 if (error) return error.message;
 const d = data as SpinResult & Raw;
 apply(d);
 return d;
}
/** Small RPM payout for a finished computer battle (server rate-limits it). */
export async function rewardOffline(result: 'win' | 'draw' | 'loss'): Promise<number> {
 if (isDemoModeActive()) return 0;
 const { data, error } = await rpc('cw_reward_offline', { _result: result });
 if (error || !data) return 0;
 const d = data as { rpm: number; balance: number };
 setRpm(d.balance);
 return d.rpm;
}
/** Restore a worn card to 100% condition: 1 RPM per missing %. Server-checked. */
export async function repairCard(id: string): Promise<string | null> {
 if (demoBlocked()) return 'demo';
 const { data, error } = await rpc('cw_repair', { _card: id });
 if (error) return error.message;
 setRpm((data as { balance: number }).balance);
 return null;
}
export function useShop() { return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state); }
