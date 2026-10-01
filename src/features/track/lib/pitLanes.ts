import type { LatLng, TrackDef } from '../types';
import { loadCircuit, loadCircuitIndex, venuesOf } from './circuitLibrary';
import { metres } from './geometry';
import { pitGates, startFinishAcrossPits } from './pits';

/** A track with its pit lane timing lines added, when the pit lane allows them (otherwise unchanged, minus stale ones). */
export function withPits(track: TrackDef, lines: LatLng[][] | null | undefined): TrackDef {
  const { pitIn: _in, pitOut: _out, pitLane: _lane, startFinishPits: _sfp, ...rest } = track;
  const g = lines?.length ? pitGates(track, lines) : null;
  if (!g) return rest;
  const across = startFinishAcrossPits(track.startFinish, g.pitLane);
  return { ...rest, ...g, ...(across ? { startFinishPits: across } : {}) };
}

/**
 * Pit lanes for a track built from a GPS lap: the nearest circuit library
 * venue's (within 2 km of the lap), so a lap recorded at a real circuit gets
 * pit lane timing too. Null when there's none or the library can't load.
 */
export async function pitLanesNear(track: TrackDef): Promise<LatLng[][] | null> {
  const at = track.outline?.[0];
  if (!at) return null;
  try {
    const venue = venuesOf(await loadCircuitIndex()).find((v) => metres(at, v) <= 2000);
    if (!venue) return null;
    const lines: LatLng[][] = [];
    for (const c of venue.layouts.slice(0, 4)) {
      const layout = await loadCircuit(c.id).catch(() => null);
      if (layout?.pits) lines.push(...layout.pits);
    }
    // Layouts at one venue usually share a pit lane: keep each line once.
    const seen = new Set<string>();
    const key = (l: LatLng[]) => [l[0], l[l.length - 1]].map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).sort().join('|') + `|${l.length}`;
    const unique = lines.filter((l) => !seen.has(key(l)) && !!seen.add(key(l)));
    return unique.length ? unique : null;
  } catch {
    return null;
  }
}
