import { MAX_CONVOY_MEMBERS } from '@/features/convoy';
import type { MergeRecord, NearbyParty } from '../types';

/** A merged convoy can't exceed a normal convoy's size. */
export const MAX_MERGED_RIDERS = MAX_CONVOY_MEMBERS;

/** Convoy/ride operations the engine needs, supplied by the ride screen. */
export interface ConvoyActions {
  createConvoy: () => Promise<{ id: string; code: string } | null>;
  joinConvoy: (code: string) => Promise<boolean>;
  leaveConvoy: (skipDeactivation?: boolean) => Promise<void>;
  /** Point the running ride at a convoy (null = solo). */
  attachRide: (convoyId: string | null) => void;
  getConvoyId: () => string | null;
  /** Tell my convoy's riders to follow me into the host convoy. */
  announceMerge: (record: MergeRecord, hostCode: string) => Promise<void>;
}

/** Actions the prompt UI can trigger; registered by the mounted engine hooks. */
export interface ProximityControls {
  invite: (party: NearbyParty) => void;
  cancelInvite: () => void;
  accept: () => void;
  decline: () => void;
}

export interface MergeControls {
  unmerge: () => Promise<void>;
}

let proximityControls: ProximityControls | null = null;
let mergeControls: MergeControls | null = null;

export function registerProximityControls(next: ProximityControls | null) {
  proximityControls = next;
}

export function registerMergeControls(next: MergeControls | null) {
  mergeControls = next;
}

export function getProximityControls(): ProximityControls | null {
  return proximityControls;
}

export function getMergeControls(): MergeControls | null {
  return mergeControls;
}
