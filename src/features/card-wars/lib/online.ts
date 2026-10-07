import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { tr } from '@/lib/i18n';
import { RULES, showRpm } from './rules';

/** One settled round of a player battle, as the server logs it. Sides are 1 and 2. */
export interface OnlineRound {
  round: number;
  /** 1 to 5, in `CATEGORIES` order. */
  category: number;
  card1: string;
  card2: string;
  damage: number;
  winner: number | null;
  /** The category a Second chance threw away, what was compared, and the dog tag each side armed. */
  first?: number | null;
  s1?: number;
  s2?: number;
  t1?: number | null;
  t2?: number | null;
  /** A Coin flip each side armed: heads or tails, and the category (1 to 5) it picked. */
  f1?: { h: boolean; c: number } | null;
  f2?: { h: boolean; c: number } | null;
  /** A round event (1 to 11, `EVENTS` order), and the cards a rapture took (side 1, side 2). */
  event?: number | null;
  r1?: string;
  r2?: string;
  /** The Redline card each side's Wildcard landed on. */
  w1?: string | null;
  w2?: string | null;
}

/** A player battle from this player's side. The server settles every round (`cw_action`). */
export interface OnlineBattle {
  code?: string;
  status?: 'waiting' | 'playing' | 'finished' | 'cancelled';
  round?: number;
  selected?: number | null;
  penalty?: boolean;
  deck?: string[];
  rivalDeck?: string[];
  hp?: number[];
  rivalHp?: number[];
  /** Powers already used, by index. */
  used?: number[];
  rivalUsed?: number[];
  /** Each side's card condition, in deck order, and what was staked. */
  wear?: number[];
  rivalWear?: number[];
  stake?: number;
  submitted?: boolean;
  rivalSubmitted?: boolean;
  side?: number;
  result?: 'win' | 'loss' | 'draw';
  deadline?: string;
  balance: number;
  log?: OnlineRound[];
  /** Own cards' ratings from riding, per slot (null: the catalog card's). */
  ratings?: (number[] | null)[] | null;
  rivalRatings?: (number[] | null)[] | null;
}

/** The server's refusals, in the app's words. Anything else reads "Battle unavailable". */
function refusal(message: string): string {
  if (/not enough|insufficient/i.test(message)) return tr("You need {0} RPM and no other battle running.", [showRpm(RULES.stake)]);
  if (/finish your current/i.test(message)) return tr("Finish your current battle first.");
  if (/wait before/i.test(message)) return tr("Wait a few seconds before inviting again.");
  if (/not found/i.test(message)) return tr("That battle code doesn't exist.");
  if (/expired/i.test(message)) return tr("That invitation has expired.");
  if (/private battle|battle unavailable/i.test(message)) return tr("That battle already has two players.");
  if (/five unique/i.test(message)) return tr("A player battle needs five different cards you own.");
  if (/redline cards for your wheel/i.test(message)) return tr("Pick five Redline cards for your wheel first.");
  if (/dog tag not owned/i.test(message)) return tr("One of your dog tags isn't yours on the server. Pick another.");
  if (/already used/i.test(message)) return tr("That dog tag is already used.");
  if (/knocked out/i.test(message)) return tr("That card is out.");
  if (/own card/i.test(message)) return tr("Your own card's ratings couldn't be checked. Try again.");
  return tr("Battle unavailable");
}

export async function battleAction(
  action: 'status' | 'create' | 'join' | 'play' | 'leave',
  opts: { code?: string; deck?: string[]; tags?: string[]; own?: ({ key: string; r: number[] } | null)[]; card?: number; tag?: number; round?: number } = {},
): Promise<OnlineBattle> {
  if (action !== 'status' && demoBlocked()) throw new Error(tr("Not available in demo mode"));
  const { data, error } = await supabase.rpc(
    'cw_action' as never,
    {
      _action: action,
      _code: opts.code || null,
      _deck: opts.deck || null,
      _card: opts.card ?? null,
      _tag: opts.tag ?? null,
      _round: opts.round ?? null,
      // Only the newer server takes the tags a deck carries.
      ...(opts.tags ? { _tags: opts.tags } : {}),
      ...(opts.own && opts.own.some(Boolean) ? { _own: opts.own } : {}),
    } as never,
  );
  if (error) throw new Error(refusal(error.message));
  return data as unknown as OnlineBattle;
}
