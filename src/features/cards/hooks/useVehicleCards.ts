import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useGarage } from '@/features/garage/hooks/useGarage';
import { useRideHistory } from '@/features/ride';
import { Bike } from '@/features/garage/types';
import { CARDS_STORAGE_KEY, CardSnapshots, CardTier, VehicleCardSnapshot } from '../types';
import { getTierForRides, tierRank } from '../lib/tier';

const MI_TO_KM = 1.60934;

export interface VehicleCardStats {
  totalRides: number;
  totalDistanceMi: number;
  totalDistanceKm: number;
  totalDurationSec: number;
  topSpeedMph: number;
  maxLean: number;
}

export interface VehicleCardData {
  bike: Bike;
  stats: VehicleCardStats;
  tier: CardTier;
  tierLabel: string;
  nextTierRides: number; // rides to next tier (0 if max)
  improved: {
    topSpeed: boolean;
    maxLean: boolean;
    distance: boolean;
    duration: boolean;
    rides: boolean;
  };
  isNewTier: boolean; // tier upgraded since last seen
}

export function useVehicleCards() {
  const { bikes } = useGarage();
  const { rides } = useRideHistory();
  const [snapshots, setSnapshots] = useLocalStorage<CardSnapshots>(CARDS_STORAGE_KEY, {});

  const cards: VehicleCardData[] = useMemo(() => {
    const completed = rides.filter((r) => r.endedAt);
    return bikes
      .map((bike) => {
        const mine = completed.filter((r) => r.bikeId === bike.id);
        const totalDistanceMi = mine.reduce((s, r) => s + r.distance, 0);
        const stats: VehicleCardStats = {
          totalRides: mine.length,
          totalDistanceMi,
          totalDistanceKm: totalDistanceMi * MI_TO_KM,
          totalDurationSec: mine.reduce((s, r) => s + r.duration, 0),
          topSpeedMph: Math.max(0, ...mine.map((r) => r.maxSpeed)),
          maxLean: Math.max(
            0,
            ...mine.map((r) => Math.max(r.maxLeanLeft || 0, r.maxLeanRight || 0)),
          ),
        };
        const tierDef = getTierForRides(stats.totalRides);
        const snap = snapshots[bike.id];
        const prevSeen: CardTier = snap?.lastSeenTier ?? 'locked';
        const improved = snap
          ? {
              topSpeed: stats.topSpeedMph > snap.topSpeedMph,
              maxLean: stats.maxLean > snap.maxLean,
              distance: stats.totalDistanceKm > snap.totalDistanceKm,
              duration: stats.totalDurationSec > snap.totalDurationSec,
              rides: stats.totalRides > snap.totalRides,
            }
          : {
              topSpeed: false,
              maxLean: false,
              distance: false,
              duration: false,
              rides: false,
            };
        const isNewTier = tierRank(tierDef.id) > tierRank(prevSeen) && tierDef.id !== 'locked';
        const next = (() => {
          // rides remaining to next tier
          const ladder = [10, 25, 50, 100, 200, 300, 400, 500, 1000];
          const n = ladder.find((m) => m > stats.totalRides);
          return n ? n - stats.totalRides : 0;
        })();
        return {
          bike,
          stats,
          tier: tierDef.id,
          tierLabel: tierDef.label,
          nextTierRides: next,
          improved,
          isNewTier,
        } as VehicleCardData;
      })
      .sort((a, b) => b.stats.totalRides - a.stats.totalRides);
  }, [bikes, rides, snapshots]);

  /** Mark a vehicle's current tier + stats as "seen" so arrows/pulse don't repeat. */
  const markTierSeen = useCallback(
    (bikeId: string) => {
      setSnapshots((prev) => {
        const card = cards.find((c) => c.bike.id === bikeId);
        if (!card) return prev;
        const next: VehicleCardSnapshot = {
          lastTier: card.tier,
          lastSeenTier: card.tier,
          topSpeedMph: card.stats.topSpeedMph,
          maxLean: card.stats.maxLean,
          totalDistanceKm: card.stats.totalDistanceKm,
          totalRides: card.stats.totalRides,
          totalDurationSec: card.stats.totalDurationSec,
        };
        return { ...prev, [bikeId]: next };
      });
    },
    [cards, setSnapshots],
  );

  return { cards, markTierSeen };
}
