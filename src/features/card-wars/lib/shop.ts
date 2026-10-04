import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive } from '@/lib/demoMode';

/** RPM balance and bought bank cards, both held by the server (`cw_shop` / `cw_buy`). */
interface ShopState { balance: number | null; owned: string[] }
let state: ShopState = { balance: null, owned: [] };
const listeners = new Set<() => void>();
const set = (s: ShopState) => { state = s; listeners.forEach(l => l()); };

export async function refreshShop() {
 if (isDemoModeActive()) return;
 const { data, error } = await supabase.rpc('cw_shop' as never);
 if (error || !data) return;
 const d = data as { balance: number; owned: string[] };
 set({ balance: d.balance, owned: d.owned ?? [] });
}
export function setRpm(balance: number) { if (state.balance !== balance) set({ ...state, balance }); }
export async function buyCard(id: string): Promise<string | null> {
 if (demoBlocked()) return 'demo';
 const { data, error } = await supabase.rpc('cw_buy' as never, { _card: id } as never);
 if (error) return error.message;
 const d = data as { balance: number };
 set({ balance: d.balance, owned: Array.from(new Set([...state.owned, id])) });
 return null;
}
export function useShop() { return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state); }
