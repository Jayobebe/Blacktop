import type { LatLng } from '../types';
import { metres } from './geometry';

/**
 * The circuit library: every OpenStreetMap circuit layout, prebuilt into laps
 * by `npm run tracks:build` and served as static files (public/circuits), so
 * search is instant and works without Overpass. Layouts come with their lap
 * and direction only; the rider places the start/finish and sectors in the
 * chase cam. Data © OpenStreetMap contributors, ODbL.
 */

export const LIBRARY_ATTRIBUTION = 'Circuit library © OpenStreetMap contributors';

export interface LibraryCircuit {
  id: number;
  name: string;
  /** Another name it's found by (the local-language name, e.g. 鈴鹿サーキット). */
  aka?: string;
  lat: number;
  lng: number;
  /** Lap length, metres. */
  length: number;
  sport?: string;
}

export interface LibraryLayout {
  id: number;
  name: string;
  length: number;
  /** Running order (from how the track is mapped); the rider can reverse it. */
  loop: LatLng[];
  /** A start line position, when the map has one. */
  start?: LatLng;
}

const base = () => `${import.meta.env.BASE_URL ?? '/'}circuits/`;

let indexPromise: Promise<LibraryCircuit[]> | null = null;

export function loadCircuitIndex(): Promise<LibraryCircuit[]> {
  if (!indexPromise) {
    indexPromise = fetch(`${base()}index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => (Array.isArray(d?.circuits) ? (d.circuits as LibraryCircuit[]) : []))
      .catch((e) => {
        indexPromise = null; // try again next time
        throw e;
      });
  }
  return indexPromise;
}

export async function loadCircuit(id: number): Promise<LibraryLayout> {
  const r = await fetch(`${base()}${Number(id)}.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const loop: LatLng[] = (d.loop ?? []).map(([lat, lng]: [number, number]) => ({ lat, lng }));
  if (loop.length < 3) throw new Error('empty layout');
  return {
    id: d.id,
    name: String(d.name ?? ''),
    length: Number(d.length) || 0,
    loop,
    start: d.start ? { lat: d.start.lat, lng: d.start.lng } : undefined,
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ');

/** Every word of the query must start a word of the name ("brands indy", "silver gp"). */
export function searchCircuits(all: LibraryCircuit[], query: string, near?: LatLng | null, limit = 8): LibraryCircuit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = all.filter((c) => {
    const name = ` ${norm(c.name)} ${norm(c.aka ?? '')}`;
    return words.every((w) => name.includes(` ${w}`)) || (!!c.aka && c.aka.includes(query.trim()));
  });
  return sortByDistance(hits, near).slice(0, limit);
}

/** Circuits within `radiusKm`, nearest first. */
export function nearbyCircuits(all: LibraryCircuit[], at: LatLng, radiusKm = 250, limit = 6): LibraryCircuit[] {
  return sortByDistance(all, at)
    .filter((c) => metres(at, c) <= radiusKm * 1000)
    .slice(0, limit);
}

function sortByDistance(list: LibraryCircuit[], at?: LatLng | null) {
  if (!at) return [...list].sort((a, b) => a.name.localeCompare(b.name));
  return [...list].sort((a, b) => metres(at, a) - metres(at, b));
}
