import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Card-for-card swaps: up to five cards and some RPM each way. Both riders
 * fill their side, both tap Ready, and the server swaps everything at once
 * (any change sets both back to not ready). Only the server moves cards.
 */
export interface SwapSide {
  cards: string[];
  rpm: number;
  ready: boolean;
  name?: string | null;
}
export interface Swap {
  id: string;
  code: string;
  status: 'open' | 'done' | 'cancelled' | 'expired';
  joined: boolean;
  expires: string;
  mine: SwapSide;
  theirs: SwapSide;
  balance?: number;
}

export const SWAP_LIMIT = 5;
export const swapLink = (origin: string, code: string) => `${origin}/arcade/card-wars?swap=${code}`;

const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);
type Answer = Swap | string;
const answer = ({ data, error }: { data: unknown; error: { message: string } | null }): Answer => (error ? error.message : (data as Swap));

export async function openSwap(): Promise<Answer> {
  if (demoBlocked()) return 'demo';
  return answer(await rpc('cw_swap_open'));
}
export async function joinSwap(code: string): Promise<Answer> {
  if (demoBlocked()) return 'demo';
  return answer(await rpc('cw_swap_join', { _code: code }));
}
export async function viewSwap(id: string): Promise<Answer> {
  if (isDemoModeActive()) return 'demo';
  return answer(await rpc('cw_swap_view', { _swap: id }));
}
export async function setSwap(id: string, cards: string[], rpm: number): Promise<Answer> {
  if (demoBlocked()) return 'demo';
  return answer(await rpc('cw_swap_set', { _swap: id, _cards: cards, _rpm: rpm }));
}
export async function readySwap(id: string, ready: boolean): Promise<Answer> {
  if (demoBlocked()) return 'demo';
  return answer(await rpc('cw_swap_ready', { _swap: id, _ready: ready }));
}
export async function cancelSwap(id: string) {
  if (demoBlocked()) return;
  await rpc('cw_swap_cancel', { _swap: id });
}
export async function mySwaps(): Promise<string[]> {
  if (isDemoModeActive()) return [];
  const { data, error } = await rpc('cw_swap_mine');
  return error || !Array.isArray(data) ? [] : (data as string[]);
}
