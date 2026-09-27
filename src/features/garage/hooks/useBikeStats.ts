import { useMemo } from 'react';
import { useRideHistory, burnedAggregate, mergeAggregates } from '@/features/ride';
import { useInheritedLogs, inheritedAggregate } from '@/features/logbook/lib/logbookStore';
import { Bike } from '../types';

const MI_TO_KM = 1.60934;

export interface BikeStats {
  totalRides: number;
  totalDistanceMi: number;
  totalDistanceKm: number;
  odometerKm: number;       // baseOdometerKm + totalDistanceKm
  totalDurationSec: number;
  topSpeedMph: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  maxGForce: number;
  longestRideMi: number;
}

export function useBikeStats(bike: Bike | null): BikeStats {
  const { rides, burnedTotals } = useRideHistory();
  const logs = useInheritedLogs();

  return useMemo(() => {
    const empty: BikeStats = {
      totalRides: 0,
      totalDistanceMi: 0,
      totalDistanceKm: 0,
      odometerKm: bike?.baseOdometerKm ?? 0,
      totalDurationSec: 0,
      topSpeedMph: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
      maxGForce: 0,
      longestRideMi: 0,
    };
    if (!bike) return empty;

    const mine = rides.filter((r) => r.endedAt && (r as any).bikeId === bike.id);
    // Rides burned from history, and history inherited from previous owners,
    // still count toward this vehicle.
    const burned = mergeAggregates(burnedAggregate(burnedTotals, bike.id), inheritedAggregate(logs[bike.id]));
    const totalDistanceMi = mine.reduce((s, r) => s + r.distance, burned.distance);
    const totalDistanceKm = totalDistanceMi * MI_TO_KM;
    return {
      totalRides: mine.length + burned.rides,
      totalDistanceMi,
      totalDistanceKm,
      odometerKm: bike.baseOdometerKm + totalDistanceKm,
      totalDurationSec: mine.reduce((s, r) => s + r.duration, burned.duration),
      topSpeedMph: Math.max(burned.maxSpeed, ...mine.map((r) => r.maxSpeed)),
      maxLeanLeft: Math.max(burned.maxLeanLeft, ...mine.map((r) => r.maxLeanLeft || 0)),
      maxLeanRight: Math.max(burned.maxLeanRight, ...mine.map((r) => r.maxLeanRight || 0)),
      maxGForce: Math.max(burned.maxGForce, ...mine.map((r) => r.maxGForce || 0)),
      longestRideMi: Math.max(burned.longestRide, ...mine.map((r) => r.distance)),
    };
  }, [bike, rides, burnedTotals, logs]);
}
