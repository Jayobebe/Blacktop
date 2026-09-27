import type { ConvoyMemberInfo } from '@/types/convoy';

/** A rider this far (km) behind the front of the group counts as "behind". */
export const BEHIND_GAP_KM = 1.5;

export interface ConvoyStatus {
  /** Riders in the convoy (with or without a live position). */
  riderCount: number;
  /** Mean current speed (mph) of riders reporting a position. */
  averageSpeedMph: number;
  /** Seconds until the last rider reaches the destination; null without a route. */
  groupEtaSeconds: number | null;
  /** Riders more than BEHIND_GAP_KM behind the front of the group. */
  behind: ConvoyMemberInfo[];
}

interface LatLng {
  lat: number;
  lng: number;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function positionOf(m: ConvoyMemberInfo): LatLng | null {
  if (m.currentLat == null || m.currentLng == null) return null;
  if (!Number.isFinite(m.currentLat) || !Number.isFinite(m.currentLng)) return null;
  return { lat: m.currentLat, lng: m.currentLng };
}

/**
 * Group numbers for the map's convoy status bar.
 *
 * `me`/`myLocation` override this rider's own row with the live GPS fix (the
 * synced row lags a few seconds). `routeSeconds` is this rider's routed time
 * to `destination`; every other rider's ETA is scaled from it by their
 * straight-line distance, so the group ETA is when the furthest rider arrives.
 *
 * "Behind" is measured against the front of the group: with a destination,
 * the rider closest to it; without one, the leader.
 */
export function computeConvoyStatus(
  members: ConvoyMemberInfo[],
  opts: {
    myUserId?: string | null;
    myLocation?: LatLng | null;
    destination?: LatLng | null;
    routeSeconds?: number | null;
  } = {},
): ConvoyStatus {
  const { myUserId, myLocation, destination, routeSeconds } = opts;

  const located = members
    .map((m) => ({ member: m, pos: m.userId === myUserId && myLocation ? myLocation : positionOf(m) }))
    .filter((r): r is { member: ConvoyMemberInfo; pos: LatLng } => r.pos !== null);

  const averageSpeedMph =
    located.length > 0 ? located.reduce((s, r) => s + (r.member.currentSpeed || 0), 0) / located.length : 0;

  let groupEtaSeconds: number | null = null;
  let behind: ConvoyMemberInfo[] = [];

  if (destination) {
    const toDest = located.map((r) => ({ ...r, km: distanceKm(r.pos, destination) }));
    const myKm = myLocation ? distanceKm(myLocation, destination) : null;
    if (routeSeconds != null && myKm != null && toDest.length > 0) {
      const furthestKm = Math.max(myKm, ...toDest.map((r) => r.km));
      // Very close to the destination the ratio blows up; fall back to my own ETA.
      groupEtaSeconds = myKm > 0.2 ? routeSeconds * (furthestKm / myKm) : routeSeconds;
    }
    if (toDest.length > 1) {
      const frontKm = Math.min(...toDest.map((r) => r.km));
      behind = toDest.filter((r) => r.km - frontKm > BEHIND_GAP_KM).map((r) => r.member);
    }
  } else {
    const leader = located.find((r) => r.member.isLeader);
    if (leader) {
      behind = located
        .filter((r) => r !== leader && distanceKm(r.pos, leader.pos) > BEHIND_GAP_KM)
        .map((r) => r.member);
    }
  }

  return { riderCount: members.length, averageSpeedMph, groupEtaSeconds, behind };
}
