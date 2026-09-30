import { supabase } from '@/integrations/supabase/client';
import { analyseCorners, burnedAggregate, keepPeakTelemetry, type BurnedTotals } from '@/features/ride';
import type { RideSession } from '@/types/blacktop';
import { weekKey, weekStart } from './challenges';

/**
 * What a rider shares with their crew: all-time totals for the crew board and
 * this week's stats for the crew challenges. Published from the crew screens
 * and after every ride (CrewStatsPublisher), which is what lets crew mates be
 * told when they're passed on the board or a challenge is decided.
 */

export interface CrewTotals {
  total_distance: number;
  top_speed: number;
  max_lean: number;
  ride_count: number;
  hit_heavy: number;
  petrol_head: number;
}

export type WeekStats = {
  distance: number;
  ride_count: number;
  max_lean: number;
  corner_score: number;
  top_speed: number;
  night_rides: number;
  longest_ride: number;
};

export function isNightRide(startedAt: string | number | Date): boolean {
  const h = new Date(startedAt).getHours();
  return h >= 20 || h < 5;
}

export function crewTotals(
  rides: RideSession[],
  burnedTotals: BurnedTotals,
  scores: { 'hit-heavy'?: number; 'petrol-head'?: number },
): CrewTotals {
  // Rides burned from history still count toward crew totals.
  const burned = burnedAggregate(burnedTotals);
  // Public Road Privacy: no peaks go to the boards while it's on.
  const peaks = keepPeakTelemetry(false);
  return {
    total_distance: rides.reduce((s, r) => s + (r.distance || 0), burned.distance),
    top_speed: peaks ? rides.reduce((s, r) => Math.max(s, r.maxSpeed || 0), burned.maxSpeed) : 0,
    max_lean: peaks ? rides.reduce((s, r) => Math.max(s, r.maxLeanLeft || 0, r.maxLeanRight || 0), Math.max(burned.maxLeanLeft, burned.maxLeanRight)) : 0,
    ride_count: rides.length + burned.rides,
    hit_heavy: scores['hit-heavy'] ?? 0,
    petrol_head: scores['petrol-head'] ?? 0,
  };
}

/** This rider's stats for the current week only. */
export function weekStats(rides: RideSession[], now = new Date()): WeekStats {
  const from = weekStart(now).getTime();
  const week = rides.filter((r) => new Date(r.startedAt).getTime() >= from);
  const peaks = keepPeakTelemetry(false);
  const cornerScores = peaks ? week.map((r) => analyseCorners(r).averageScore).filter((s) => s > 0) : [];
  return {
    distance: Number(week.reduce((s, r) => s + (r.distance || 0), 0).toFixed(2)),
    ride_count: week.length,
    max_lean: peaks ? Math.round(Math.max(0, ...week.map((r) => Math.max(r.maxLeanLeft || 0, r.maxLeanRight || 0)))) : 0,
    corner_score: cornerScores.length ? Math.round(cornerScores.reduce((s, v) => s + v, 0) / cornerScores.length) : 0,
    top_speed: peaks ? Math.round(Math.max(0, ...week.map((r) => r.maxSpeed || 0))) : 0,
    night_rides: week.filter((r) => isNightRide(r.startedAt)).length,
    longest_ride: Number(Math.max(0, ...week.map((r) => r.distance || 0)).toFixed(2)),
  };
}

/** Publishes this rider's own crew-board row. Returns false when it couldn't. */
export async function publishCrewTotals(crewCode: string, name: string, totals: CrewTotals): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('crew_scores' as any).upsert({
    user_id: user.id,
    crew_code: crewCode,
    display_name: name || 'Rider',
    total_distance: totals.total_distance,
    top_speed: totals.top_speed,
    max_lean: totals.max_lean,
    ride_count: totals.ride_count,
    hit_heavy: totals.hit_heavy,
    petrol_head: Math.round(totals.petrol_head),
    updated_at: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  if (error) console.error('Failed to publish crew scores:', error);
  return !error;
}

/** Publishes this rider's own row for this week's crew challenges. */
export async function publishWeekStats(crewCode: string, name: string, stats: WeekStats, key = weekKey()): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('crew_weekly_scores' as any).upsert({
    user_id: user.id,
    week_key: key,
    crew_code: crewCode,
    display_name: name || 'Rider',
    ...stats,
    updated_at: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  if (error) console.error('Failed to publish weekly crew stats:', error);
  return !error;
}
