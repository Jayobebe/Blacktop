import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import type { VehicleType } from '@/features/experience/lib/vehicles';
import type { SharedCardPayload } from '@/features/cards/lib/cardCodec';
import type { Lap, LatLng, TrackDef, TrackSession } from '../types';
import { toLocal } from './geometry';
import { trackLength } from './trackStore';
import { DEMO_TRACK_BOARD } from './demoBoard';

/**
 * Track records: the opt-in leaderboards (Settings → Your Blacktop → Track Day
 * → Track leaderboards). A rider's best lap on a circuit library layout goes
 * on that layout's board for their direction and vehicle class
 * (`submit_track_lap`, migration 20261008000000_track_records.sql); every
 * rider it beats gives them that rider's dog tag (a Spectre of their card)
 * and 3 Speed Demon badges, and tells the rider beaten. Only library layouts
 * have boards: custom GPS tracks are personal (nobody rides the same line).
 */

export type Direction = 'cw' | 'ccw';

export interface BoardRow {
  rank: number;
  display_name: string;
  vehicle_name: string | null;
  lap_ms: number;
  set_at: string;
  is_me: boolean;
}

export interface Beaten {
  display_name: string;
  vehicle_name: string | null;
  lap_ms: number;
  card: SharedCardPayload | null;
}

/** Which way round the lap runs (its outline's winding). */
export function lapDirection(outline: LatLng[] | undefined): Direction {
  if (!outline || outline.length < 3) return 'cw';
  const o = outline[0];
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = toLocal(outline[i], o);
    const b = toLocal(outline[(i + 1) % outline.length], o);
    area += a.x * b.y - b.x * a.y;
  }
  return area > 0 ? 'ccw' : 'cw';
}

/** The lap a session puts on the board: its fastest clean flying lap (all sectors, no pits, good GPS). */
export function recordLap(session: TrackSession): Lap | null {
  return session.laps.filter((l) => l.valid && !l.pit && !l.lowConfidence).reduce<Lap | null>((b, l) => (!b || l.ms < b.ms ? l : b), null);
}

/** Whether a track has a board at all (a circuit library layout). */
export const hasBoard = (track: Pick<TrackDef, 'osmId'> | null | undefined): track is Pick<TrackDef, 'osmId'> & { osmId: number } =>
  !!track && Number.isInteger(track.osmId);

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
  Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** A board: the fastest riders on a layout, one direction, one vehicle class. */
export async function fetchBoard(osmId: number, direction: Direction, vehicleClass: VehicleType, limit = 20): Promise<BoardRow[]> {
  if (isDemoModeActive()) return DEMO_TRACK_BOARD(osmId, direction, vehicleClass);
  const { data, error } = await supabase.rpc('track_leaderboard' as never, { _osm_id: osmId, _direction: direction, _vehicle_class: vehicleClass, _limit: limit } as never);
  if (error) throw error;
  return ((data ?? []) as BoardRow[]).map((r) => ({ ...r, rank: Number(r.rank) }));
}

/**
 * Puts a finished session's record lap on its board. Resolves to the riders it
 * beat and the rider's rank, or null when there's nothing to submit, the
 * server can't be reached in time, or it said no.
 */
export async function submitRecord(args: {
  track: TrackDef;
  session: TrackSession;
  vehicleClass: VehicleType;
  displayName: string;
  vehicleName: string | null;
  card: SharedCardPayload | null;
}): Promise<{ beaten: Beaten[]; rank: number | null; lap: Lap } | null> {
  const { track, session } = args;
  const lap = recordLap(session);
  if (!lap || !hasBoard(track) || isDemoModeActive()) return null;
  const length = Math.round(trackLength(track) ?? 0);
  if (length < 200) return null;
  const direction = lapDirection(track.outline);
  const res = await withTimeout(
    supabase.rpc('submit_track_lap' as never, {
      _osm_id: track.osmId,
      _direction: direction,
      _vehicle_class: args.vehicleClass,
      _lap_ms: Math.round(lap.ms),
      _sectors: lap.sectors.map((s) => Math.round(s)),
      _length_m: length,
      _track_name: track.name,
      _display_name: args.displayName,
      _vehicle_name: args.vehicleName,
      _card: args.card,
    } as never),
    8000,
  );
  if (!res || (res as { error: unknown }).error) return null;
  const beaten = (((res as { data: unknown }).data ?? []) as Beaten[]).filter((b) => b && typeof b.lap_ms === 'number');
  const board = await withTimeout(fetchBoard(track.osmId!, direction, args.vehicleClass, 100).catch(() => null), 4000);
  const rank = board?.find((r) => r.is_me)?.rank ?? null;
  return { beaten, rank, lap };
}

/** Opting out: the rider's times come off every board. */
export async function leaveBoards(): Promise<void> {
  if (isDemoModeActive()) return;
  await supabase.rpc('leave_track_leaderboards' as never);
}

/** m:ss.SSS */
export function lapClock(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
