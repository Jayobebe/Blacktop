/**
 * Riders find each other through one realtime presence channel per grid
 * cell. A rider announces in its own cell and listens to the 3×3 block around
 * it, so anyone within a cell's width (~5 km) is always seen, and nobody
 * further away ever receives their position.
 */
export const CELL_DEG = 0.05;

/** Close enough to prompt (roughly the range a group rides within). */
export const ALERT_RADIUS_M = 400;
/** Shown as faint dots on the map. */
export const VISIBLE_RADIUS_M = 1500;
/** Must stay close this long before a prompt, so riders passing the other way don't trigger one. */
export const DWELL_MS = 20_000;

export function cellOf(lat: number, lng: number): { row: number; col: number } {
  return { row: Math.floor(lat / CELL_DEG), col: Math.floor(lng / CELL_DEG) };
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function neighbourhood(lat: number, lng: number): string[] {
  const { row, col } = cellOf(lat, lng);
  const keys: string[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) keys.push(cellKey(row + dr, col + dc));
  }
  return keys;
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatMeters(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
