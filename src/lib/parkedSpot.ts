import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

/**
 * Where the vehicle was left: the last fix of the ride that just ended, kept
 * on the phone only (`blacktop_parked`, left out of backups: it belongs to the
 * moment). The end-of-ride card asks whether to save it, then whether it's a
 * multi-storey, and takes the floor and bay there, since GPS can't tell one
 * floor of a car park from another and often drops out under concrete (the
 * pin is where the phone last had sky, usually the way in). The map draws it
 * as a pin with walking directions back. Cleared when the next ride starts,
 * or by hand.
 */

export interface ParkedSpot {
  lat: number;
  lng: number;
  /** When the ride ended (ms). */
  at: number;
  /** In a multi-storey: the floor and the bay, as the rider typed them. */
  floor?: string;
  bay?: string;
}

const KEY = 'blacktop_parked';
const listeners = new Set<() => void>();
let spot: ParkedSpot | null | undefined;

function read(): ParkedSpot | null {
  if (spot !== undefined) return spot;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as ParkedSpot | null;
    spot = v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch {
    spot = null;
  }
  return spot;
}

function write(next: ParkedSpot | null) {
  spot = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* kept for this launch */
  }
  listeners.forEach((l) => l());
}

export const getParkedSpot = read;

export function setParkedSpot(lat: number, lng: number) {
  write({ lat, lng, at: Date.now() });
}

export function setParkedLevel(patch: { floor?: string; bay?: string }) {
  const s = read();
  if (!s) return;
  const next = { ...s, ...patch };
  write({ ...next, floor: next.floor?.trim().slice(0, 12) || undefined, bay: next.bay?.trim().slice(0, 12) || undefined });
}

/** "Floor 3, bay 42" (either alone), or null. */
export function parkedLevelText(s: ParkedSpot): string | null {
  if (s.floor && s.bay) return tr("Floor {0}, bay {1}", [s.floor, s.bay]);
  if (s.floor) return tr("Floor {0}", [s.floor]);
  if (s.bay) return tr("Bay {0}", [s.bay]);
  return null;
}

export function clearParkedSpot() {
  if (read()) write(null);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useParkedSpot(): ParkedSpot | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Walking directions back to it in the phone's own maps app. */
export function walkBackUrl(s: { lat: number; lng: number }): string {
  const ll = `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${ll}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`;
}
