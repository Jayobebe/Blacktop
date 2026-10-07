import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { RULES, levelRounds, wearLoss } from './rules';
import { getVault, updateVault, wearReportOf } from './store';
import type { BattleCard, BattleState, WearReport } from '../types';

/** Condition regained per battle a card sits out (resting in the garage). */
export const REST_RECOVERY = RULES.wear.rest;

export function conditionOf(wear: Record<string, number> | undefined, id: string): number {
  const v = wear?.[id];
  return typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 100;
}

/**
 * Game ratings at a given condition. Stats hold until 50%, then fade to half
 * at 0%. Race cards' distance fades from the first battle: road cards go
 * further between rebuilds.
 */
export function withWear(card: BattleCard, condition: number): BattleCard {
  const general = condition >= 50 ? 1 : 1 - (50 - condition) * 0.01;
  const distance = card.spec === 'race' ? general * (0.6 + (0.4 * condition) / 100) : general;
  const r = card.ratings;
  const scale = (v: number, m: number) => Math.round(v * m);
  return {
    ...card,
    condition,
    ratings: { speed: scale(r.speed, general), lean: scale(r.lean, general), g: scale(r.g, general), corners: scale(r.corners, general), distance: scale(r.distance, distance) },
  };
}

/** Rounds each of the player's cards fought in a battle, by card id. */
export function roundsFought(run: BattleState): Record<string, number> {
  const rounds: Record<string, number> = {};
  for (const l of run.log) rounds[l.player] = (rounds[l.player] ?? 0) + 1;
  return rounds;
}

/** Condition after a battle against the computer: cards that fought wear (by the rounds they fought), the rest recover. */
export function wearAfterRun(wear: Record<string, number> | undefined, run: BattleState, owned: BattleCard[]): Record<string, number> {
  const rounds = roundsFought(run);
  const raptured = run.log.find((l) => l.raptured?.[0])?.raptured?.[0];
  const next: Record<string, number> = { ...(wear || {}) };
  for (const card of owned) {
    const c = conditionOf(wear, card.id);
    // Beamed back at full condition.
    if (card.id === raptured) {
      next[card.id] = 100;
      continue;
    }
    next[card.id] = rounds[card.id] ? Math.max(0, c - wearLoss(card.spec === 'race', levelRounds(run.level, rounds[card.id]))) : Math.min(100, c + REST_RECOVERY);
  }
  return next;
}

const toMap = (rows: { card_id: string; condition: number }[] | null) => Object.fromEntries((rows || []).map((r) => [r.card_id, r.condition]));

/** The server holds the one condition count shared by computer and player battles. */
export async function fetchServerWear(): Promise<Record<string, number> | null> {
  if (isDemoModeActive()) return null;
  const { data, error } = await supabase.rpc('cw_my_wear' as never);
  return error ? null : toMap(data as never);
}

/**
 * Battles against the computer are settled on the phone, so each one's wear
 * is reported afterwards. Reports wait in a queue (kept with the vault) and go
 * out oldest first; the server ignores one it has already taken, so a retry
 * after a lost answer is safe. Nothing waits on the queue to start another
 * battle: an offline evening of battles is reported when the phone is back.
 */
const QUEUE_LIMIT = 20;

export function queueWear(run: BattleState) {
  if (isDemoModeActive() || !run.log.length) return;
  const queue = (getVault().wearQueue ?? []).filter((r) => r.id !== run.id);
  updateVault({ wearQueue: [...queue, wearReportOf(run)].slice(-QUEUE_LIMIT) });
}

type Sent = { wear: Record<string, number> } | 'retry' | 'rejected';

async function send(report: WearReport): Promise<Sent> {
  // By round where the server counts them; a report saved by an older app only knows which cards fought.
  const byRound = report.rounds?.length === report.deck.length;
  const { data, error } = byRound
    ? await supabase.rpc('cw_report_wear' as never, { _run: report.id, _deck: report.deck, _rounds: report.rounds, _raptured: report.raptured ?? null } as never)
    : await supabase.rpc('cw_save_wear' as never, { _run: report.id, _deck: report.deck, _fought: report.fought, _raptured: report.raptured ?? null } as never);
  if (!error) return { wear: toMap(data as never) };
  // No code: the request never reached the database (offline). "Too many
  // battles" is the server's rate limit. Both are worth another go. Anything
  // else is the server saying no for good, and a report that can never be
  // taken must not sit at the head of the queue for ever.
  return error.code && !/too many/i.test(error.message) ? 'rejected' : 'retry';
}

let saving: Promise<boolean> | null = null;

/** Sends what's waiting. True once nothing is. */
export function flushPendingWear(): Promise<boolean> {
  if (saving) return saving;
  if (isDemoModeActive() || !getVault().wearQueue?.length) return Promise.resolve(true);
  saving = (async () => {
    for (;;) {
      const next = getVault().wearQueue?.[0];
      if (!next) return true;
      const sent = await send(next).catch(() => 'retry' as const);
      if (sent === 'retry') return false;
      const rest = (getVault().wearQueue ?? []).filter((r) => r.id !== next.id);
      // The server's figures replace the phone's own sums once everything is in.
      updateVault({ wearQueue: rest, ...(sent !== 'rejected' && !rest.length ? { wear: sent.wear } : {}) });
    }
  })().finally(() => {
    saving = null;
  });
  return saving;
}

let syncing: Promise<void> | null = null;

/** Reports what's waiting, then reads the server's condition for every card. Never while reports wait: they'd be overwritten. */
export function syncWear(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!(await flushPendingWear())) return;
    const before = getVault().wear;
    const wear = await fetchServerWear();
    if (wear && !getVault().wearQueue?.length && getVault().wear === before) updateVault({ wear });
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
