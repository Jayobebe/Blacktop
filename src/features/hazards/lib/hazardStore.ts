import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Hazard, HazardKind } from '../types';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Live hazard reports near the rider (module store, like the rest of the app).
 * Everything goes through the database functions in the hazards migration, so
 * reports stay anonymous. After a report or vote a broadcast on
 * `hazards:live` tells other riders looking at that area to refetch; the
 * broadcast carries a position only, never who sent it.
 *
 * Demo mode never touches the database: a few sample reports appear around
 * wherever the map looks, and reports, votes and removals stay on the phone.
 */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const hazards = new Map<string, Hazard>();
let snapshot: Hazard[] = [];
const listeners = new Set<() => void>();
/** Areas we've fetched recently: a nudge inside any of them triggers a refetch. */
const watched: { bounds: Bounds; at: number }[] = [];

function emit() {
  const now = Date.now();
  snapshot = [...hazards.values()].filter((h) => h.expiresAt > now);
  listeners.forEach((l) => l());
}

export function useHazards(): Hazard[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      ensureLive();
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function getHazards(): Hazard[] {
  return snapshot;
}

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
/** The hazard functions aren't in the generated types yet. */
function rpc<T>(fn: string, args: Record<string, unknown>): RpcResult<T> {
  return (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => RpcResult<T> }).rpc(fn, args);
}

interface Row {
  id: string;
  kind: HazardKind;
  lat: number;
  lng: number;
  heading: number | null;
  created_at: string;
  expires_at: string;
  confirmations: number;
  denials: number;
  mine: boolean | null;
  my_vote: boolean | null;
}

const toHazard = (r: Row): Hazard => ({
  id: r.id,
  kind: r.kind,
  lat: r.lat,
  lng: r.lng,
  heading: r.heading,
  createdAt: Date.parse(r.created_at),
  expiresAt: Date.parse(r.expires_at),
  confirmations: r.confirmations ?? 0,
  denials: r.denials ?? 0,
  mine: !!r.mine,
  myVote: r.my_vote,
});

const inside = (b: Bounds, p: { lat: number; lng: number }) => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;

/** Clamp to what the server accepts (2° × 3°) around the box's centre. */
function clampBounds(b: Bounds): Bounds {
  const cLat = (b.south + b.north) / 2;
  const cLng = (b.west + b.east) / 2;
  const hLat = Math.min(1, (b.north - b.south) / 2);
  const hLng = Math.min(1.5, (b.east - b.west) / 2);
  return { south: cLat - hLat, north: cLat + hLat, west: cLng - hLng, east: cLng + hLng };
}


/** Sample reports scattered round the middle of an area, stable for that spot. */
const DEMO_KINDS: HazardKind[] = ['pothole', 'roadworks', 'hivis', 'oil', 'gravel', 'animal'];
function demoHazards(b: Bounds): Hazard[] {
  const cLat = Math.round(((b.south + b.north) / 2) * 50) / 50;
  const cLng = Math.round(((b.west + b.east) / 2) * 50) / 50;
  const now = Date.now();
  const r = (n: number) => {
    const x = Math.sin(n * 12.9898 + cLat * 78.233 + cLng * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };
  return Array.from({ length: 5 }, (_, i) => ({
    id: `demo-hz-${cLat}-${cLng}-${i}`,
    kind: DEMO_KINDS[Math.floor(r(i) * DEMO_KINDS.length)],
    lat: cLat + (r(i + 10) - 0.5) * 0.03,
    lng: cLng + (r(i + 20) - 0.5) * 0.045,
    heading: null,
    createdAt: now - Math.floor(r(i + 30) * 40) * 60_000,
    expiresAt: now + (30 + Math.floor(r(i + 40) * 90)) * 60_000,
    confirmations: Math.floor(r(i + 50) * 6),
    denials: 0,
    mine: false,
    myVote: null,
  }));
}

/** Loads the live reports in an area, replacing what we had there. */
export async function fetchHazards(area: Bounds): Promise<void> {
  const b = clampBounds(area);
  if (isDemoModeActive()) {
    for (const h of demoHazards(b)) if (!hazards.has(h.id)) hazards.set(h.id, h);
    emit();
    return;
  }
  const { data, error } = await rpc<Row[]>('hazards_in_bbox', { _west: b.west, _south: b.south, _east: b.east, _north: b.north });
  if (error || !data) return;
  for (const [id, h] of hazards) if (inside(b, h)) hazards.delete(id);
  for (const r of data) hazards.set(r.id, toHazard(r));
  watched.push({ bounds: b, at: Date.now() });
  while (watched.length > 6) watched.shift();
  emit();
}

let live: ReturnType<typeof supabase.channel> | null = null;
function ensureLive() {
  if (live) return;
  live = supabase.channel('hazards:live', { config: { broadcast: { self: false } } });
  live
    .on('broadcast', { event: 'changed' }, ({ payload }) => {
      const p = payload as { lat?: number; lng?: number };
      if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return;
      const hit = watched.find((w) => Date.now() - w.at < 15 * 60_000 && inside(w.bounds, { lat: p.lat!, lng: p.lng! }));
      if (hit) void fetchHazards(hit.bounds);
    })
    .subscribe();
}

function nudge(at: { lat: number; lng: number }) {
  if (isDemoModeActive()) return;
  ensureLive();
  // Rounded: other riders only need to know roughly where to look.
  void live?.send({ type: 'broadcast', event: 'changed', payload: { lat: +at.lat.toFixed(3), lng: +at.lng.toFixed(3) } });
}

export class HazardError extends Error {
  constructor(readonly reason: 'signed-out' | 'rate-limited' | 'failed') {
    super(reason);
  }
}

/** Reports a hazard here. Returns its id (an existing one when it merged with a nearby report). */
export async function reportHazard(kind: HazardKind, at: { lat: number; lng: number }, heading: number | null): Promise<string> {
  if (isDemoModeActive()) {
    const id = `demo-mine-${Date.now()}`;
    const now = Date.now();
    hazards.set(id, { id, kind, lat: at.lat, lng: at.lng, heading, createdAt: now, expiresAt: now + 60 * 60_000, confirmations: 0, denials: 0, mine: true, myVote: null });
    emit();
    return id;
  }
  const { data, error } = await rpc<string>('report_hazard', {
    _kind: kind,
    _lat: at.lat,
    _lng: at.lng,
    _heading: heading != null && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null,
  });
  if (error || !data) {
    const msg = error?.message ?? '';
    throw new HazardError(/rate limited/i.test(msg) ? 'rate-limited' : /not signed in|JWT|auth/i.test(msg) ? 'signed-out' : 'failed');
  }
  const now = Date.now();
  const existing = hazards.get(data);
  hazards.set(data, existing ?? {
    id: data,
    kind,
    lat: at.lat,
    lng: at.lng,
    heading,
    createdAt: now,
    expiresAt: now + 60 * 60_000,
    confirmations: 0,
    denials: 0,
    mine: true,
    myVote: null,
  });
  emit();
  nudge(at);
  return data;
}

export async function voteHazard(id: string, stillThere: boolean): Promise<void> {
  const h = hazards.get(id);
  if (h) {
    hazards.set(id, { ...h, myVote: stillThere });
    emit();
  }
  if (isDemoModeActive()) return;
  const { error } = await rpc<null>('vote_hazard', { _id: id, _still_there: stillThere });
  if (error) throw new HazardError(/rate limited/i.test(error.message) ? 'rate-limited' : 'failed');
  if (h) nudge(h);
}

export async function removeMyHazard(id: string): Promise<void> {
  const h = hazards.get(id);
  hazards.delete(id);
  emit();
  if (isDemoModeActive()) return;
  const { error } = await rpc<null>('remove_my_hazard', { _id: id });
  if (error) throw new HazardError('failed');
  if (h) nudge(h);
}

/** A box `radiusM` around a point. */
export function boundsAround(p: { lat: number; lng: number }, radiusM: number): Bounds {
  const dLat = radiusM / 110_540;
  const dLng = radiusM / (111_320 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
  return { south: p.lat - dLat, north: p.lat + dLat, west: p.lng - dLng, east: p.lng + dLng };
}
