/**
 * Routes the rider saved (Blacktop Console → Plan a route, pages/PlanRoute):
 * from one place to another through any stops, the way between them worked out when saved
 * and its map tiles downloaded as an offline pack (so the route draws with no
 * signal). They're listed in the map's search like saved places: picking one
 * loads it as the route (its start a stop, its end the destination, as an
 * imported GPX route does), and it's removed there the same way, its tiles
 * with it. Kept on the phone (`blacktop_saved_routes`, carried by backups;
 * the tiles aren't, being IndexedDB).
 */
import { useSyncExternalStore } from 'react';
import { deletePack } from './offlinePacks';
import { DEMO_SAVED_ROUTES, isDemoModeActive, useDemoMode } from '@/lib/demoMode';

export interface SavedRouteEnd {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  /** A twisty pick's bends on the way here from the point before (ridden as "Twisty leg" stops). */
  shape?: { lat: number; lng: number }[];
}

export interface SavedRoute {
  id: string;
  name: string;
  from: SavedRouteEnd;
  /** Stops on the way, in order. */
  via?: SavedRouteEnd[];
  to: SavedRouteEnd;
  distanceMeters: number;
  durationSeconds: number;
  /** The offline pack holding its tiles (deleted with it). */
  packId?: string;
  createdAt: string;
}

const KEY = 'blacktop_saved_routes';
const MAX = 50;

function read(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedRoute[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.from && r.to) : [];
  } catch {
    return [];
  }
}

let routes: SavedRoute[] = typeof window !== 'undefined' ? read() : [];
const listeners = new Set<() => void>();
function commit(next: SavedRoute[]) {
  routes = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}

/** The rider's routes (demo mode: the demo's). */
export const getSavedRoutes = () => (isDemoModeActive() ? DEMO_SAVED_ROUTES : routes);

export function saveRoute(r: Omit<SavedRoute, 'id' | 'createdAt'>): SavedRoute {
  const route: SavedRoute = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  commit([route, ...routes]);
  return route;
}

export async function deleteSavedRoute(id: string) {
  const r = routes.find((x) => x.id === id);
  commit(routes.filter((x) => x.id !== id));
  if (r?.packId) await deletePack(r.packId).catch(() => {});
}

export function useSavedRoutes(): SavedRoute[] {
  const demo = useDemoMode().enabled;
  const real = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => routes,
    () => routes,
  );
  return demo ? DEMO_SAVED_ROUTES : real;
}
