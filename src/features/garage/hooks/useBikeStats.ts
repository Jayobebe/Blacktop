import { useMemo } from 'react';
import { useRideHistory } from '@/features/ride';
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
  const { rides } = useRideHistory();

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
    const totalDistanceMi = mine.reduce((s, r) => s + r.distance, 0);
    const totalDistanceKm = totalDistanceMi * MI_TO_KM;
    return {
      totalRides: mine.length,
      totalDistanceMi,
      totalDistanceKm,
      odometerKm: bike.baseOdometerKm + totalDistanceKm,
      totalDurationSec: mine.reduce((s, r) => s + r.duration, 0),
      topSpeedMph: Math.max(0, ...mine.map((r) => r.maxSpeed)),
      maxLeanLeft: Math.max(0, ...mine.map((r) => r.maxLeanLeft || 0)),
      maxLeanRight: Math.max(0, ...mine.map((r) => r.maxLeanRight || 0)),
      maxGForce: Math.max(0, ...mine.map((r) => r.maxGForce || 0)),
      longestRideMi: Math.max(0, ...mine.map((r) => r.distance)),
    };
  }, [bike, rides]);
}
