/**
 * Where the rider is, for the Console's weather, hazards and parked-spot
 * distance: the map's last position (or the parked spot) straight away, then a
 * rough fix while the Console is on screen, only where location was already
 * allowed (it never makes the phone ask), at most once every ten minutes.
 */
import { useEffect, useState } from 'react';
import { getLastView } from '@/features/map/lib/lastView';
import { getParkedSpot } from '@/lib/parkedSpot';
import { locationWasGranted, noteLocationGranted } from '@/lib/locationGrant';

export interface Spot {
  lat: number;
  lng: number;
  /** From a fix just now (else the last place the map saw). */
  live: boolean;
}

let fresh: { lat: number; lng: number; at: number } | null = null;

/** The best place known without asking anything. */
export function knownSpot(): Spot | null {
  if (fresh) return { lat: fresh.lat, lng: fresh.lng, live: Date.now() - fresh.at < 10 * 60_000 };
  const v = getLastView() ?? getParkedSpot();
  return v ? { lat: v.lat, lng: v.lng, live: false } : null;
}

export function useRiderSpot(active: boolean): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(() => knownSpot());
  useEffect(() => {
    if (!active) return;
    setSpot(knownSpot());
    if (!locationWasGranted() || !navigator.geolocation) return;
    if (fresh && Date.now() - fresh.at < 10 * 60_000) return;
    let live = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        noteLocationGranted();
        fresh = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
        if (live) setSpot({ lat: fresh.lat, lng: fresh.lng, live: true });
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
    return () => {
      live = false;
    };
  }, [active]);
  return spot;
}

/** Metres between two places. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
