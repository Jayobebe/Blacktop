/**
 * The speed limit of the road the rider is on, from OpenStreetMap's `maxspeed`.
 *
 * The shared speed-limit map first: the roads of one map cell at a time (`CELL` degrees a side,
 * a little margin so a road along the edge still matches), fetched from Overpass the first time
 * anyone rides through a cell and kept in Supabase storage for everyone after that
 * (supabase/functions/place-search/speedCells.ts, keep `CELL` / `MARGIN` in step). The phone looks
 * in its own copy (lib/speedCellStore.ts), then reads the stored cell straight from storage, and
 * only asks the `place-search` function (`kind: 'speedlimits'`, by cell number) for a cell nobody
 * has yet or one over a month old; the next cell along too once the rider is near an edge.
 * `RoadMatcher` (lib/speedLimitRoads.ts) then follows the roads on the phone, so a turn or a new
 * limit along the road shows at once and riding asks nothing. A road with no limit mapped, or
 * "none" (a German autobahn), shows nothing.
 *
 * While the rider's cell isn't there yet (a first fetch can take Overpass most of a minute) or
 * couldn't be had, Valhalla (`kind: 'roadlimit'`) answers instead: the rider's last few fixes,
 * matched to the roads, asked when the road changes (`LimitAsker`). Before the shared map
 * (2026-10-29) every moving phone asked one of the two all the time, so the public servers capped
 * how many could ride at once; now it's one fetch a cell a month, however many ride through.
 *
 * Fed by `SpeedLimitFeed` (App) from the ride's GPS or the map's, only while the rider has the
 * live speed on; nothing is fetched otherwise.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { decodeCellWays, LimitAsker, RoadMatcher, type CellFile, type SpeedLimit, type Way } from './speedLimitRoads';
import { currentUnits } from './units';
import { readSpeedCell, writeSpeedCell } from './speedCellStore';
import { getExperience } from '@/features/experience';

export type { SpeedLimit } from './speedLimitRoads';

const CELL = 0.015;
const MARGIN = 0.002;
const KEEP_CELLS = 12;
const RETRY_MS = 120_000;
/** A stored cell older than this is fetched again (the function refreshes it for everyone). */
const CELL_FRESH_MS = 30 * 86_400_000;
const BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/storage/v1/object/public/speed-cells/v1`;
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

const usable = (f: unknown, row: number, col: number): f is CellFile => {
  const c = f as CellFile | null;
  return !!c && c.v === 1 && c.row === row && c.col === col && Array.isArray(c.w) && typeof c.at === 'number';
};

/** The cell from this phone's copy, then the shared map in storage, then the function (which fetches and saves it). */
async function fetchCell(row: number, col: number): Promise<Way[]> {
  const key = cellKey(row, col);
  const fresh = (f: CellFile) => Date.now() - f.at < CELL_FRESH_MS;
  let stale: CellFile | null = null;
  try {
    const mine = await readSpeedCell(key);
    const f = mine ? JSON.parse(mine) : null;
    if (usable(f, row, col)) {
      if (fresh(f)) return decodeCellWays(f, CELL, MARGIN);
      stale = f;
    }
  } catch { /* fetch it */ }
  try {
    const res = await fetch(`${BUCKET_URL}/${row}/${col}.json`);
    if (res.ok) {
      const text = await res.text();
      const f = JSON.parse(text);
      if (usable(f, row, col) && fresh(f)) {
        void writeSpeedCell(key, text);
        return decodeCellWays(f, CELL, MARGIN);
      }
    }
  } catch { /* not stored yet, or no bucket: ask the function */ }
  try {
    const { data, error } = await supabase.functions.invoke('place-search', { body: { kind: 'speedlimits', row, col } });
    if (error || !usable(data, row, col)) throw error ?? new Error('no cell');
    void writeSpeedCell(key, JSON.stringify(data));
    return decodeCellWays(data, CELL, MARGIN);
  } catch (e) {
    // Overpass down and nobody has the cell: an old copy beats nothing.
    if (stale) return decodeCellWays(stale, CELL, MARGIN);
    throw e;
  }
}

function loadCell(row: number, col: number) {
  const key = cellKey(row, col);
  const have = cells.get(key);
  if (have && (have.ways || have.loading || (have.failedAt && Date.now() - have.failedAt < RETRY_MS))) return;
  const cell: Cell = { at: Date.now(), ways: null };
  cell.loading = fetchCell(row, col)
    .then((ways) => {
      cell.ways = ways;
    })
    .catch(() => {
      // Overpass down and nobody has it yet: Valhalla meanwhile, and try again in a while.
      cell.failedAt = Date.now();
    })
    .finally(() => {
      cell.loading = undefined;
    });
  cells.set(key, cell);
  // Keep the most recent few in memory (the rest are on the phone).
  if (cells.size > KEEP_CELLS) {
    const oldest = [...cells.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cells.delete(oldest[0]);
  }
}

// ── Valhalla: the road the rider's trail is on ──────────────────────────

/** Fixes kept for the trail: at least this far apart, the last few. */
const TRAIL_STEP_M = 12;
const TRAIL_LEN = 8;
/** Valhalla failed (or the function doesn't know the kind): left alone for this long. */
const VALHALLA_REST_MS = 120_000;
/** Moving at this (m/s, about 4 mph) or more: standing still asks nothing. */
const MOVING_MS = 1.8;

let trail: Array<[number, number]> = [];
const asker = new LimitAsker();
let asking = false;
let valhallaRestUntil = 0;

const metres = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * 111_320;
  const dLng = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

/** Valhalla's km/h as a limit in the rider's own unit (Settings): 48 km/h is the 30 mph sign. */
function limitFromKmh(kmh: number): SpeedLimit {
  return currentUnits().speed === 'kph'
    ? { kmh, unit: 'kmh', value: Math.round(kmh) }
    : { kmh, unit: 'mph', value: Math.round(kmh / MPH) };
}

function vehicleNow(): 'motorcycle' | 'car' | 'bicycle' {
  const main = getExperience().vehicles[0];
  return main === 'car' ? 'car' : main === 'bicycle' || main === 'ebike' || main === 'escooter' ? 'bicycle' : 'motorcycle';
}

function askValhalla() {
  asking = true;
  asker.asked(trail, Date.now());
  const sent = trail.slice();
  supabase.functions
    .invoke('place-search', { body: { kind: 'roadlimit', points: sent, vehicle: vehicleNow() } })
    .then(({ data, error }) => {
      const a = data as { matched?: unknown; kmh?: unknown; road?: unknown } | null;
      if (error || !a || typeof a.matched !== 'boolean') throw error ?? new Error('no answer');
      const kmh = a.matched && typeof a.kmh === 'number' && a.kmh > 0 ? a.kmh : null;
      asker.answered(a.matched && typeof a.road === 'string' ? a.road : null, kmh);
      // Off every road, or a road with no limit mapped: no sign.
      set(kmh !== null ? limitFromKmh(kmh) : null);
    })
    .catch(() => {
      valhallaRestUntil = Date.now() + VALHALLA_REST_MS;
    })
    .finally(() => {
      asking = false;
    });
}

// ── Following the rider ──────────────────────────────────────────────────

let matcher = new RoadMatcher();

/** A GPS fix (speed in m/s when known). */
export function feedSpeedLimitFix(lat: number, lng: number, speed: number | null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const here: [number, number] = [lng, lat];
  // The newest point always follows the rider; it's kept as a new point once it's TRAIL_STEP_M on
  // from the one before. (Measuring from the newest point, which each fix had just replaced, never
  // got there under about 27 mph with fixes a second apart, so towns never showed a limit.)
  const before = trail[trail.length - 2];
  if (trail.length < 2 || metres(before, trail[trail.length - 1]) >= TRAIL_STEP_M) trail = [...trail.slice(-(TRAIL_LEN - 1)), here];
  else trail[trail.length - 1] = here;
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
  if (cell?.ways) {
    // The shared map: matched on the phone, nothing asked.
    cell.at = Date.now();
    set(matcher.step(lat, lng, speed, cell.ways));
    return;
  }
  // Not here yet (or couldn't be had): Valhalla, when the road changes.
  if (Date.now() >= valhallaRestUntil) {
    const moving = speed == null || speed >= MOVING_MS;
    if (!asking && moving && asker.due(trail, Date.now())) askValhalla();
  }
}

/** Forget the road (the ride ended, the map closed). */
export function clearSpeedLimit() {
  matcher = new RoadMatcher();
  trail = [];
  asker.reset();
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
