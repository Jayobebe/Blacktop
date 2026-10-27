/**
 * Blacktop Radio's six presets, like a car radio's: a station id in each slot
 * (null: empty). Until the rider saves one, the built-in live stations fill
 * them. Held on a preset button, the station playing goes into that slot.
 * Kept on the phone (`blacktop_radio_presets`, carried by backups).
 */
import { useSyncExternalStore } from 'react';
import { LIVE_STATIONS } from './liveStations';

export const PRESET_COUNT = 6;
const KEY = 'blacktop_radio_presets';
const listeners = new Set<() => void>();

function defaults(): Array<string | null> {
  return Array.from({ length: PRESET_COUNT }, (_, i) => LIVE_STATIONS[i]?.id ?? null);
}

function read(): Array<string | null> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!Array.isArray(v)) return defaults();
    return Array.from({ length: PRESET_COUNT }, (_, i) => (typeof v[i] === 'string' ? (v[i] as string) : null));
  } catch {
    return defaults();
  }
}

let presets = read();

export function usePresets(): Array<string | null> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => presets,
    () => presets,
  );
}

export function setPreset(slot: number, stationId: string | null) {
  presets = presets.map((id, i) => (i === slot ? stationId : id));
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}
