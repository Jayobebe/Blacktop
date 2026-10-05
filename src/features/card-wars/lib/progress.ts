import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { isDemoModeActive } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import type { BattleState } from '../types';
import { cardById } from './catalog';
import type { OnlineBattle } from './online';
import { refreshShop, setRpm } from './shop';

/**
 * Sets (every Road and Race card from one maker) and the day's three
 * contracts. The server decides both: what's complete, what's paid, and what
 * each battle report is allowed to count. This store only shows its answers.
 */
export interface SetInfo {
  maker: string;
  total: number;
  owned: number;
  claimed: boolean;
  rpm: number;
}
export interface Contract {
  id: ContractId;
  target: number;
  rpm: number;
  progress: number;
  paid: boolean;
}
export type ContractId = 'win2' | 'play3' | 'corners_bike' | 'ko3' | 'f1_ko' | 'second_win' | 'full_deck' | 'event_win' | 'player_win';
export type Facts = Partial<Record<ContractId, number>>;

interface State {
  sets: SetInfo[];
  contracts: Contract[];
}
let state: State = { sets: [], contracts: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const rpc = (name: string, args?: object) => supabase.rpc(name as never, args as never);

export function useProgress(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export async function refreshProgress() {
  if (isDemoModeActive()) return;
  const [s, c] = (await Promise.all([rpc('cw_sets'), rpc('cw_contracts_today')])) as unknown as { data: unknown; error: unknown }[];
  set({
    ...(!s.error && Array.isArray(s.data) ? { sets: s.data as SetInfo[] } : {}),
    ...(!c.error && c.data ? { contracts: ((c.data as { contracts: Contract[] }).contracts ?? []) as Contract[] } : {}),
  });
}

export async function claimSet(maker: string): Promise<{ rpm: number } | string> {
  if (demoBlocked()) return 'demo';
  const { data, error } = await rpc('cw_set_claim', { _maker: maker });
  if (error) return error.message;
  void refreshShop();
  void refreshProgress();
  return { rpm: (data as { rpm: number }).rpm };
}

/** Sends what a finished battle did; returns RPM the contracts paid. Each battle counts once on the server. */
export async function reportContracts(run: string, facts: Facts): Promise<number> {
  if (isDemoModeActive() || !Object.values(facts).some((v) => (v ?? 0) > 0)) return 0;
  const { data, error } = await rpc('cw_contract_report', { _run: run, _facts: facts });
  if (error || !data) return 0;
  const d = data as { contracts: Contract[]; earned: number; balance?: number };
  set({ contracts: d.contracts ?? state.contracts });
  if (typeof d.balance === 'number') setRpm(d.balance);
  return d.earned ?? 0;
}

const add = (f: Facts, k: ContractId, n = 1) => {
  f[k] = (f[k] ?? 0) + n;
};

/** What a battle against the computer counts for. */
export function computerFacts(run: BattleState, fullDeck: boolean): Facts {
  const f: Facts = {};
  add(f, 'play3');
  if (run.result === 'win') add(f, 'win2');
  if (fullDeck) add(f, 'full_deck');
  const hp = run.opponent.map(() => 100);
  for (const l of run.log) {
    const mine = run.player.find((c) => c.id === l.player);
    const theirs = run.opponent.findIndex((c) => c.id === l.opponent);
    if (l.winner === 0) {
      if (l.category === 'corners' && mine?.vehicle === 'bike') add(f, 'corners_bike');
      if (l.first) add(f, 'second_win');
      if (l.event) add(f, 'event_win');
      if (theirs >= 0) {
        hp[theirs] = Math.max(0, hp[theirs] - l.damage);
        if (hp[theirs] === 0) {
          add(f, 'ko3');
          if (mine?.bank === 'f1' || cardById(mine?.archetype ?? '')?.bank === 'f1') add(f, 'f1_ko');
        }
      }
    }
  }
  return f;
}

/** And a player battle, read from the server's log. */
export function onlineFacts(b: OnlineBattle, fullDeck: boolean): Facts {
  const f: Facts = {};
  add(f, 'play3');
  if (b.result === 'win') {
    add(f, 'win2');
    add(f, 'player_win');
  }
  if (fullDeck) add(f, 'full_deck');
  const me = b.side ?? 1;
  const hp = [100, 100, 100, 100, 100];
  for (const l of b.log ?? []) {
    if (l.winner !== me) continue;
    const mine = cardById(me === 1 ? l.card1 : l.card2);
    if (l.category === 5 && mine?.vehicle === 'bike') add(f, 'corners_bike');
    if (l.first) add(f, 'second_win');
    if (l.event) add(f, 'event_win');
    const rival = b.rivalDeck?.indexOf(me === 1 ? l.card2 : l.card1) ?? -1;
    if (rival >= 0) {
      hp[rival] = Math.max(0, hp[rival] - l.damage);
      if (hp[rival] === 0) {
        add(f, 'ko3');
        if (mine?.bank === 'f1') add(f, 'f1_ko');
      }
    }
  }
  return f;
}

export function contractText(id: ContractId, target: number): string {
  switch (id) {
    case 'win2':
      return tr("Win {0} battles", [target]);
    case 'play3':
      return tr("Finish {0} battles", [target]);
    case 'corners_bike':
      return tr("Win a Corners round with a bike");
    case 'ko3':
      return tr("Knock out {0} cards", [target]);
    case 'f1_ko':
      return tr("Knock out a card with an F1 car");
    case 'second_win':
      return tr("Win a round with Second chance");
    case 'full_deck':
      return tr("Battle with every card at full condition");
    case 'event_win':
      return tr("Win a round during an event");
    default:
      return tr("Win a player battle");
  }
}
