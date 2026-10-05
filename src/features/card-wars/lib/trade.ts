import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive } from '@/lib/demoMode';
import { refreshShop, setRpm } from './shop';
import { getVault, updateVault } from './store';

/**
 * Selling cards between players. The seller shows a code (or its QR) for one
 * card; a buyer offers RPM for it, which the server holds until the seller
 * accepts or declines (or the sale lapses after a day). The server moves the
 * card and the RPM together; this only asks it.
 */
export interface Sale {
  id: string;
  code: string;
  card: string;
  expires: string;
  offers: { id: string; rpm: number; from: string }[];
}
export interface MyOffer {
  id: string;
  rpm: number;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
  card: string;
  code: string;
}
export interface SaleView {
  id: string;
  code: string;
  card: string;
  status: string;
  mine: boolean;
  owned: boolean;
  myOffer: number | null;
}

export const SALE_CODE = /^[A-F0-9]{6}$/i;
export const saleLink = (origin: string, code: string) => `${origin}/arcade/card-wars?sale=${code}`;

const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);

function refusal(message: string): string {
  if (/not enough/i.test(message)) return 'rpm';
  if (/not found|gone/i.test(message)) return 'gone';
  if (/already owned|already owns/i.test(message)) return 'owned';
  if (/own card/i.test(message)) return 'self';
  if (/too many/i.test(message)) return 'many';
  if (/current battle/i.test(message)) return 'battle';
  if (/not owned/i.test(message)) return 'notowned';
  return 'error';
}

export async function myTrades(): Promise<{ selling: Sale[]; buying: MyOffer[] } | null> {
  if (isDemoModeActive()) return { selling: [], buying: [] };
  const { data, error } = await rpc('cw_trades_mine');
  return error ? null : (data as { selling: Sale[]; buying: MyOffer[] });
}

export async function listCard(card: string): Promise<{ code: string } | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_trade_list', { _card: card });
  return error ? refusal(error.message) : (data as { code: string });
}

export async function viewSale(code: string): Promise<SaleView | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_trade_view', { _code: code });
  return error ? refusal(error.message) : (data as SaleView);
}

export async function makeOffer(code: string, rpm: number): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_trade_offer', { _code: code, _rpm: rpm });
  if (error) return refusal(error.message);
  setRpm((data as { balance: number }).balance);
  return null;
}

export async function withdrawOffer(id: string) {
  if (demoBlocked()) return;
  const { data } = await rpc('cw_trade_withdraw', { _offer: id });
  if (data) setRpm((data as { balance: number }).balance);
}

export async function cancelSale(id: string) {
  if (demoBlocked()) return;
  await rpc('cw_trade_cancel', { _trade: id });
}

/** Accept or decline an offer. A sale takes the card out of this phone's deck and winnings too. */
export async function answerOffer(id: string, accept: boolean): Promise<string | null> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_trade_respond', { _offer: id, _accept: accept });
  if (error) return refusal(error.message);
  const d = data as { balance: number; card?: string };
  setRpm(d.balance);
  if (d.card) {
    const v = getVault();
    updateVault({ deck: v.deck.filter((x) => x !== d.card), rewards: v.rewards.filter((x) => x !== d.card) });
  }
  void refreshShop();
  return null;
}
