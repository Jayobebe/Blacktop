import type { BoardRow, Direction } from './trackRecords';

/**
 * Demo mode's track boards: made-up riders (names stay in English, like the
 * other demo data), the demo rider mid-table so both sides of a rivalry show.
 * Times are steady per layout, direction and class, scaled to a plausible lap.
 */
const RIVALS: [string, string][] = [
  ['Rico', 'Panigale V4'],
  ['Marlowe', 'YZF-R1'],
  ['Priya', 'Street Triple RS'],
  ['Demo Rider', 'V4 Ducati'],
  ['Kit', 'MT-09'],
  ['Dave', 'SV650'],
  ['Hana', 'RSV4'],
];

/** Brands Hatch's two layouts get their real-feeling times; other layouts a guess from their id. */
const BASE_MS: Record<number, number> = { 11248425: 51_900, 7218462: 97_800 };

export function DEMO_TRACK_BOARD(osmId: number, direction: Direction, vehicleClass: string): BoardRow[] {
  const base = (BASE_MS[osmId] ?? 60_000 + (osmId % 45_000)) * (vehicleClass === 'car' ? 1.04 : 1) * (direction === 'ccw' ? 1.01 : 1);
  return RIVALS.map(([name, bike], i) => ({
    rank: i + 1,
    display_name: name,
    vehicle_name: bike,
    lap_ms: Math.round(base + i * 412 + ((osmId >> i) % 97)),
    set_at: new Date(Date.now() - (i + 1) * 3 * 86_400_000).toISOString(),
    is_me: name === 'Demo Rider',
  }));
}
