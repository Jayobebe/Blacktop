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
  /** Pit lane lines, when the map has them (pit lane timing). */
  pits?: LatLng[][];
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
    pits: Array.isArray(d.pits)
      ? (d.pits as [number, number][][]).map((l) => l.map(([lat, lng]) => ({ lat, lng }))).filter((l) => l.length >= 2)
      : undefined,
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

function sortByDistance<T extends { name: string; lat: number; lng: number }>(list: T[], at?: LatLng | null): T[] {
  if (!at) return [...list].sort((a, b) => a.name.localeCompare(b.name));
  return [...list].sort((a, b) => metres(at, a) - metres(at, b));
}

// ── venues: a circuit's layouts together ─────────────────────────────────────

/** One circuit with its layouts (Brands Hatch: Grand Prix, Indy). */
export interface LibraryVenue {
  /** The words the layouts share ("Brands Hatch"), or the longest layout's name. */
  name: string;
  /** True when `name` is the layouts' shared start, so each layout is named by the rest. */
  shared: boolean;
  lat: number;
  lng: number;
  /** Longest first. */
  layouts: LibraryCircuit[];
}

/** Words that don't name a venue on their own. */
const GENERIC = /^(the|circuit|circuito|circuit[oa]s?|autodromo|autódromo|raceway|speedway|track|trackway|kartbana|motodrom)$/i;

/** Layout centres within this of each other are one venue. */
const VENUE_RADIUS_M = 2500;

/** What a layout is called within its venue ("Indy" at Brands Hatch); the full name when nothing's left. */
export function layoutLabel(venue: LibraryVenue, c: LibraryCircuit): string {
  if (venue.layouts.length < 2 || !venue.shared) return c.name;
  const rest = c.name.slice(venue.name.length).replace(/^[\s\-–—:,]+/, '').trim();
  return rest || c.name;
}

function commonWords(names: string[]): string {
  const split = names.map((n) => n.split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    const w = split[0][i];
    if (!split.every((s) => s[i]?.toLowerCase() === w.toLowerCase())) break;
    out.push(w);
  }
  return out.join(' ').replace(/[\s\-–—:,]+$/, '');
}

let venueCache: { from: LibraryCircuit[]; venues: LibraryVenue[] } | null = null;

/** Groups the library's layouts by venue (nearby centres). */
export function venuesOf(all: LibraryCircuit[]): LibraryVenue[] {
  if (venueCache?.from === all) return venueCache.venues;
  const parent = all.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (Math.abs(all[i].lat - all[j].lat) > 0.05) continue;
      if (metres(all[i], all[j]) <= VENUE_RADIUS_M) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, LibraryCircuit[]>();
  all.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]));
  const venues = [...groups.values()].map((layouts) => {
    layouts.sort((a, b) => b.length - a.length);
    const common = layouts.length > 1 ? commonWords(layouts.map((l) => l.name)) : '';
    // "Circuit" or "Autódromo" alone isn't a venue's name.
    const shared = common.length >= 3 && !(/^\S+$/.test(common) && GENERIC.test(common));
    return {
      name: shared ? common : layouts[0].name,
      shared,
      lat: layouts[0].lat,
      lng: layouts[0].lng,
      layouts,
    };
  });
  venueCache = { from: all, venues };
  return venues;
}

/** Venues where the venue or any layout matches every word of the query. */
export function searchVenues(all: LibraryCircuit[], query: string, near?: LatLng | null, limit = 8): LibraryVenue[] {
  const hits = new Set(searchCircuits(all, query, null, Infinity).map((c) => c.id));
  const words = norm(query).split(/\s+/).filter(Boolean);
  const list = venuesOf(all).filter(
    (v) => v.layouts.some((l) => hits.has(l.id)) || (words.length > 0 && words.every((w) => ` ${norm(v.name)}`.includes(` ${w}`))),
  );
  return sortByDistance(list, near).slice(0, limit);
}

/** Venues within `radiusKm`, nearest first. */
export function nearbyVenues(all: LibraryCircuit[], at: LatLng, radiusKm = 250, limit = 6): LibraryVenue[] {
  return sortByDistance(venuesOf(all), at)
    .filter((v) => metres(at, v) <= radiusKm * 1000)
    .slice(0, limit);
}
