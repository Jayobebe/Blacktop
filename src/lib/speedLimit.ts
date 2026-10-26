/**
 * The speed limit of the road the rider is on, from OpenStreetMap's `maxspeed`.
 *
 * The phone asks the `place-search` function (`kind: 'speedlimits'`) for the
 * roads in one map cell at a time (`CELL` degrees a side, a little margin so a
 * road along the edge still matches), kept in memory, and the next cell along
 * once the rider is near its edge; `RoadMatcher` (lib/speedLimitRoads.ts)
 * follows them along the roads. A road with no limit mapped, or "none" (a
 * German autobahn), shows nothing.
 *
 * Fed by `SpeedLimitFeed` (App) from the ride's GPS or the map's, only while
 * the rider has the live speed on; nothing is fetched otherwise. Requests:
 * about one a minute at motorway speed, none standing still.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseMaxspeed, RoadMatcher, type SpeedLimit, type Way } from './speedLimitRoads';

export type { SpeedLimit } from './speedLimitRoads';

const CELL = 0.015;
const MARGIN = 0.002;
const KEEP_CELLS = 12;
const RETRY_MS = 120_000;
const MPH = 1.609344;

// ── The store ────────────────────────────────────────────────────────────

let current: SpeedLimit | null = null;
const listeners = new Set<() => void>();
function set(next: SpeedLimit | null) {
  if (next === current || (next && current && next.kmh === current.kmh && next.unit === current.unit)) return;
  current = next;
  listeners.forEach((l) => l());
}
export function getSpeedLimit(): SpeedLimit | null {
  return current;
}
export function useSpeedLimit(): SpeedLimit | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}

// ── Cells ────────────────────────────────────────────────────────────────

type Cell = { at: number; ways: Way[] | null; failedAt?: number; loading?: Promise<void> };
const cells = new Map<string, Cell>();

const cellKey = (row: number, col: number) => `${row}:${col}`;
const cellOf = (lat: number, lng: number) => [Math.floor(lat / CELL), Math.floor(lng / CELL)] as const;

function loadCell(row: number, col: number) {
  const key = cellKey(row, col);
  const have = cells.get(key);
  if (have && (have.ways || have.loading || (have.failedAt && Date.now() - have.failedAt < RETRY_MS))) return;
  const south = row * CELL - MARGIN;
  const west = col * CELL - MARGIN;
  const cell: Cell = { at: Date.now(), ways: null };
  cell.loading = supabase.functions
    .invoke('place-search', { body: { kind: 'speedlimits', south, west, north: south + CELL + 2 * MARGIN, east: west + CELL + 2 * MARGIN } })
    .then(({ data, error }) => {
      const raw = (data as { ways?: unknown } | null)?.ways;
      if (error || !Array.isArray(raw)) throw error ?? new Error('no ways');
      cell.ways = (raw as [string | null, number[]][])
        .filter((w) => Array.isArray(w) && Array.isArray(w[1]) && w[1].length >= 4)
        .map(([tag, line]) => ({ limit: parseMaxspeed(tag), pts: Float64Array.from(line) }));
    })
    .catch(() => {
      // An older function without speed limits, or Overpass down: try again in a while.
      cell.failedAt = Date.now();
    })
    .finally(() => {
      cell.loading = undefined;
    });
  cells.set(key, cell);
  // Keep the most recent few.
  if (cells.size > KEEP_CELLS) {
    const oldest = [...cells.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cells.delete(oldest[0]);
  }
}

// ── Following the rider ──────────────────────────────────────────────────

let matcher = new RoadMatcher();

/** A GPS fix (speed in m/s when known). */
export function feedSpeedLimitFix(lat: number, lng: number, speed: number | null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const [row, col] = cellOf(lat, lng);
  loadCell(row, col);
  // Near an edge: the next cell along too, so it's there when the rider crosses.
  const fr = lat / CELL - row;
  const fc = lng / CELL - col;
  if (fr < 0.2) loadCell(row - 1, col);
  if (fr > 0.8) loadCell(row + 1, col);
  if (fc < 0.2) loadCell(row, col - 1);
  if (fc > 0.8) loadCell(row, col + 1);
  const cell = cells.get(cellKey(row, col));
  if (cell?.ways) cell.at = Date.now();
  set(matcher.step(lat, lng, speed, cell?.ways ?? null));
}

/** Forget the road (the ride ended, the map closed). */
export function clearSpeedLimit() {
  matcher = new RoadMatcher();
  set(null);
}

// ── Colours ──────────────────────────────────────────────────────────────

/**
 * Where the live speed turns amber and red (mph). With the limit colours on and
 * a limit known: amber over the limit, red at 10 % over; otherwise the rider's
 * own sliders.
 */
export function speedBands(
  settings: { amberSpeedThreshold: number; redSpeedThreshold: number; speedLimitColours?: boolean },
  limit: SpeedLimit | null,
): { amber: number; red: number; byLimit: boolean } {
  if (settings.speedLimitColours !== false && limit) {
    const mph = limit.kmh / MPH;
    return { amber: mph + 0.5, red: mph * 1.1, byLimit: true };
  }
  return { amber: settings.amberSpeedThreshold, red: settings.redSpeedThreshold, byLimit: false };
}

/** The limit's figure in the rider's unit: the sign's own when the units match, else converted. */
export function limitFigure(limit: SpeedLimit, unit: 'mph' | 'kph' | string): number {
  const wantMph = unit !== 'kph';
  if (wantMph === (limit.unit === 'mph')) return limit.value;
  return Math.round(wantMph ? limit.kmh / MPH : limit.kmh);
}
