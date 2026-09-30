import type { BurnedAggregate } from '@/features/ride/lib/tripBurner';
import type { Bike } from '@/features/garage/types';
import type { BadgeType } from '@/types/convoy';

/** One ride as recorded in a vehicle's logbook (no GPS / sensor tracks). */
export interface LogRide {
  id: string;
  startedAt: string;
  endedAt: string | null;
  name?: string;
  isConvoyRide: boolean;
  distance: number; // miles
  duration: number; // seconds
  averageSpeed: number;
  /** Peaks are null on rides a previous owner handed over with Public Road Privacy on: shown as "--". */
  maxSpeed: number | null;
  maxLeanLeft: number | null;
  maxLeanRight: number | null;
  maxGForce?: number | null;
  earnedBadges?: BadgeType[];
  /** Time-attack result, if the ride was one. */
  challenge?: { vehicleName: string; ownerName: string; role: 'set' | 'attempt'; timeSec: number; targetSec: number | null; result?: string };
  /** Track Pack session, if the ride was one. */
  track?: { trackName: string; laps: number; bestLapMs: number | null };
  /** Rider who owned the vehicle at the time. */
  owner: string;
}

/** A remark written into the logbook by whoever held it at the time. */
export interface LogNote {
  id: string;
  author: string;
  at: number;
  text: string;
}

export interface LogOwner {
  name: string;
  /** Epoch ms the vehicle came to them (garage add or hand-over). */
  from: number;
  /** Epoch ms they handed it on. */
  to: number;
}

/**
 * History a vehicle carries from previous owners. Counts toward the
 * vehicle's own stats / card, never toward its new owner's rider totals.
 */
export interface InheritedLog {
  owners: LogOwner[];
  rides: LogRide[];
  /** Rides that were burned from history before hand-over (totals only). */
  archived: BurnedAggregate;
  /** Passport number, fixed when the vehicle was first logged and kept for life. */
  passport?: string;
  /** Remarks from every keeper; they travel with the vehicle. */
  notes?: LogNote[];
}

/** What travels from the old owner's phone to the new owner's. */
export interface LogbookPackage {
  v: 1;
  bike: Omit<Bike, 'id' | 'createdAt'>;
  log: InheritedLog;
  fromName: string;
  handedOverAt: number;
}
