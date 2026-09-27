/** What each opted-in rider publishes to nearby riders while riding. */
export interface RiderBeacon {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  speedMph: number;
  convoyId: string | null;
  convoyCode: string | null;
  convoyName: string | null;
  leaderId: string | null;
  isLeader: boolean;
  memberCount: number;
  at: number;
}

/** A nearby rider as seen from this device. */
export interface NearbyRider extends RiderBeacon {
  distanceM: number;
}

/**
 * Riders are grouped into "parties": a convoy (keyed by its id) or a solo
 * rider (keyed `solo:<userId>`). Prompts, snoozes and invites work per party.
 */
export interface NearbyParty {
  key: string;
  kind: 'solo' | 'convoy';
  /** Who handles invites for this party: the solo rider, or the convoy leader. */
  contactId: string;
  contactName: string;
  /** Convoy leader's beacon, when in range (a convoy is only invitable if it is). */
  contact: NearbyRider | null;
  riders: NearbyRider[];
  memberCount: number;
  distanceM: number;
  /** When the party first came within the alert radius (for the dwell timer). */
  closeSince: number | null;
}

/**
 * pair:  solo ↔ solo, a new convoy is made.
 * join:  solo rider joins a convoy (either side can start it).
 * merge: leader ↔ leader, the smaller convoy moves into the bigger one.
 */
export type InviteKind = 'pair' | 'join' | 'merge';

export interface Invite {
  id: string;
  kind: InviteKind;
  fromId: string;
  fromName: string;
  toId: string;
  /** Sender's party summary, for the prompt text. */
  fromConvoyId: string | null;
  fromMemberCount: number;
  sentAt: number;
}

/** Remembered on each device that took part in a merge, so it can be undone. */
export interface MergeRecord {
  mergeId: string;
  /** host: led the convoy that absorbed the other. guest-leader / guest: came from the absorbed convoy. */
  role: 'host' | 'guest-leader' | 'guest';
  hostConvoyId: string;
  hostLeaderId: string;
  hostName: string;
  homeConvoyId: string;
  homeCode: string;
  homeLeaderId: string;
  homeName: string;
}
