/**
 * A passenger asking the convoy's leader to go somewhere: picked on the
 * passenger map (its search bar, a place's card, Request), sent over a
 * convoy-wide broadcast (`route-request-<convoy id>`, nothing stored). The
 * leader's phone shows who wants to go where (`RouteRequestHost`, App) with
 * Twisty, Direct and No thanks; Twisty or Direct opens the Blacktop map and
 * goes there as its own place card does (lib/mapConsole `requestMapPlace`), so
 * it becomes the convoy's route and everyone's guidance. The answer goes back
 * to the passenger as a toast. One channel a device, while in a convoy.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RoutePlace {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export interface RouteRequest {
  /** One per request, so an answer finds its way back. */
  id: string;
  fromId: string;
  fromName: string;
  place: RoutePlace;
}

export interface RouteAnswer {
  id: string;
  toId: string;
  fromName: string;
  place: string;
  /** Twisty or Direct, or turned down. */
  answer: 'twisty' | 'direct' | 'no';
}

const SEND_GAP_MS = 4000;
let channel: ReturnType<typeof supabase.channel> | null = null;
let lastSentAt = 0;

export function setRouteRequestChannel(ch: ReturnType<typeof supabase.channel> | null) {
  channel = ch;
}

/** Only what a place can be: a short name and address and a real position. */
export function cleanPlace(raw: unknown): RoutePlace | null {
  const p = raw as Partial<RoutePlace> | null;
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  const name = String(p.name ?? '').trim().slice(0, 80);
  if (!name) return null;
  return { name, address: p.address ? String(p.address).slice(0, 160) : undefined, lat: p.lat, lng: p.lng };
}

/** Ask the leader to go here. False when there's no convoy channel or one was just sent. */
export async function sendRouteRequest(fromId: string, fromName: string, place: RoutePlace): Promise<boolean> {
  const clean = cleanPlace(place);
  if (!channel || !clean) return false;
  if (Date.now() - lastSentAt < SEND_GAP_MS) return false;
  lastSentAt = Date.now();
  const req: RouteRequest = { id: `${fromId}:${Date.now()}`, fromId, fromName: fromName.slice(0, 30), place: clean };
  await channel.send({ type: 'broadcast', event: 'request', payload: req });
  return true;
}

export async function sendRouteAnswer(a: RouteAnswer) {
  await channel?.send({ type: 'broadcast', event: 'answer', payload: a });
}

// ── The requests waiting on the leader's phone ─────────────────────────────

let waiting: RouteRequest[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function addRouteRequest(r: RouteRequest) {
  // A newer one from the same passenger replaces theirs.
  waiting = [...waiting.filter((w) => w.fromId !== r.fromId), r].slice(-5);
  emit();
}

export function dropRouteRequest(id: string) {
  waiting = waiting.filter((w) => w.id !== id);
  emit();
}

export function clearRouteRequests() {
  if (!waiting.length) return;
  waiting = [];
  emit();
}

export function useRouteRequests(): RouteRequest[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waiting,
    () => waiting,
  );
}
