/**
 * Card challenge run store.
 *
 * A "card challenge" is a time attack attached to a dropped trading card.
 * Two modes:
 *  - `setting`   — the card owner rides the route that becomes the challenge.
 *  - `attempting`— a challenger races the stored route against the owner's time.
 *
 * Module-level singleton + listeners (the app-wide pattern), so the map, the
 * ride tracker and the receipt renderer all read the same live state without a
 * React context.
 */
import { useSyncExternalStore } from 'react';

export interface ChallengePoint {
  lat: number;
  lng: number;
}

export type ChallengeResult = 'won' | 'lost' | 'void';

export interface ChallengeRun {
  mode: 'setting' | 'attempting';
  dropId: string;
  vehicleName: string;
  ownerName: string;
  tier?: string;
  /** Where the card sits — always the start line. */
  start: ChallengePoint;
  /** Stored route being raced (attempting only). */
  route: ChallengePoint[];
  finish: ChallengePoint | null;
  /** Time to beat, seconds (attempting only). */
  targetSec: number | null;
  /** Epoch ms when the 5-second countdown ends and the clock starts. */
  startsAt: number;
  /** First moment the rider strayed off route, or null while on route. */
  offRouteSince: number | null;
  voided: boolean;
}

/** Challenge outcome stapled onto the saved ride receipt. */
export interface RideChallenge {
  dropId: string;
  vehicleName: string;
  ownerName: string;
  tier?: string;
  /** 'set' when this ride created the challenge. */
  role: 'set' | 'attempt';
  targetSec: number | null;
  timeSec: number;
  result?: ChallengeResult;
  route: ChallengePoint[];
}

let run: ChallengeRun | null = null;
let pendingReceipt: RideChallenge | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getChallengeRun(): ChallengeRun | null {
  return run;
}

export function startChallengeRun(next: ChallengeRun) {
  run = next;
  emit();
}

export function updateChallengeRun(patch: Partial<ChallengeRun>) {
  if (!run) return;
  run = { ...run, ...patch };
  emit();
}

export function clearChallengeRun() {
  run = null;
  emit();
}

/** Stage the outcome so the next saved ride carries the challenge receipt. */
export function setPendingChallengeReceipt(receipt: RideChallenge | null) {
  pendingReceipt = receipt;
}

/** Read-and-clear — called once as a ride is written to history. */
export function takePendingChallengeReceipt(): RideChallenge | undefined {
  const r = pendingReceipt;
  pendingReceipt = null;
  return r ?? undefined;
}

export function useChallengeRun(): ChallengeRun | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getChallengeRun,
    () => null,
  );
}
