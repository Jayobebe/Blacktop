import { REDLINES } from './redline';
import { useSyncExternalStore } from 'react';
import { isDemoModeActive, onDemoModeChange } from '@/lib/demoMode';
import { STARTERS, STARTER_TAGS } from './catalog';
import { TAG_SLOTS, type BattleState, type VaultState, type WearReport } from '../types';
import { levelRounds } from './rules';

/**
 * What Card Wars keeps on the phone: the deck, the battle against the computer
 * in progress, cards won from it, and the last card condition the server gave.
 * One module store (Burn clears the key). Demo mode gets a fresh one with a
 * starter deck and never saves.
 */
const KEY = 'bt.card_wars.v1';

const initial = (): VaultState => ({ deck: [], tags: STARTER_TAGS.slice(0, TAG_SLOTS).map((t) => t.id), rewards: [], unlocks: [], run: null });
const demo = (): VaultState => ({ ...initial(), deck: [...STARTERS], redlines: REDLINES.slice(0, 7).map((c) => c.id) });

/** What the server needs to know about a finished battle: the deck, which of it fought, and for how many rounds. */
export const wearReportOf = (run: BattleState): WearReport => ({
  id: run.id,
  deck: run.player.map((c) => c.id),
  fought: Array.from(new Set(run.log.map((l) => l.player))),
  // Easy and medium wear cards less: fewer of the rounds count.
  rounds: run.player.map((c) => levelRounds(run.level, run.log.filter((l) => l.player === c.id).length)),
  ...(run.level ? { level: run.level } : {}),
  raptured: run.log.find((l) => l.raptured?.[0])?.raptured?.[0] ?? null,
});

function load(): VaultState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.deck) && Array.isArray(saved.tags) && Array.isArray(saved.rewards)) {
      const vault: VaultState = { ...initial(), ...saved };
      if (vault.pendingWear) {
        if (vault.pendingWear.log?.length) vault.wearQueue = [...(vault.wearQueue ?? []), wearReportOf(vault.pendingWear)];
        delete vault.pendingWear;
      }
      return vault;
    }
  } catch {
    /* start again */
  }
  return initial();
}

let state = isDemoModeActive() ? demo() : load();
const listeners = new Set<() => void>();

onDemoModeChange(() => {
  state = isDemoModeActive() ? demo() : load();
  listeners.forEach((l) => l());
});

export function updateVault(patch: Partial<VaultState>) {
  state = { ...state, ...patch };
  if (!isDemoModeActive()) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* kept for this visit only */
    }
  }
  listeners.forEach((l) => l());
}

/** Keeps the picked prize: the card joins the collection and the battle is marked settled. */
export function claimReward(id: string): boolean {
  const run = state.run;
  if (!run || run.result !== 'win' || run.rewardClaimed || !run.rewardOrder.includes(id)) return false;
  updateVault({ rewards: Array.from(new Set([...state.rewards, id])), run: { ...run, rewardClaimed: true, chosenReward: id } });
  return true;
}

export function getVault() {
  return state;
}

export function useVault() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
