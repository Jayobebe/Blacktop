import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { hasServerCap } from '@/lib/serverCaps';
import { getLastView } from '@/features/map/lib/lastView';
import { locationWasGranted, noteLocationGranted } from '@/lib/locationGrant';

/**
 * The rider's country, for Blacktop World's globe (which glows by where
 * accounts are). The phone works it out from where it is and sends only the
 * country's number; the position stays here. Where it is: the last fix the
 * Blacktop map had, or, for a rider who has never had one there (the map isn't
 * everyone's first stop, and at first nobody at all was being counted), a
 * rough fix asked for now, only on a phone that has already allowed location,
 * so this never brings up a permission prompt of its own. It's part of Blacktop
 * World: with that off, nothing is sent and anything sent before is taken back.
 *
 * Cheap to call on every launch: the world map is only loaded when there's no
 * answer yet or the rider has moved far enough that it might have changed.
 */
const KEY = 'blacktop_profile_country';
const RECHECK_KM = 150;

interface Sent {
  c: number;
  lat: number;
  lng: number;
}

function sent(): Sent | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && Number.isFinite(v.c) && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch {
    return null;
  }
}

function worldOn(): boolean {
  try {
    return JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}')?.blacktopWorldEnabled !== false;
  } catch {
    return true;
  }
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371;
}

/** Location is already allowed here (asked without prompting where the browser can say; iOS can't, so the note we keep). */
async function allowed(): Promise<boolean> {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm?.state === 'granted') return true;
    if (perm?.state === 'denied') return false;
  } catch {
    /* no answer: go by the note */
  }
  return locationWasGranted();
}

async function whereNow(): Promise<{ lat: number; lng: number } | null> {
  const seen = getLastView();
  if (seen) return seen;
  if (typeof navigator === 'undefined' || !navigator.geolocation || !(await allowed())) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        noteLocationGranted();
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => resolve(null),
      // A country needs no accuracy and no fresh fix.
      { enableHighAccuracy: false, maximumAge: 24 * 3600000, timeout: 10000 },
    ),
  );
}

let running = false;

/** True when the server's answer changed (so a count on screen is worth fetching again). */
export async function syncProfileCountry(): Promise<boolean> {
  if (running || isDemoModeActive() || !hasServerCap('worldCountries')) return false;
  running = true;
  try {
    const before = sent();
    if (!worldOn()) {
      if (!before) return false;
      const { error } = await supabase.rpc('set_profile_country' as never, { _country: null } as never);
      if (error) return false;
      localStorage.removeItem(KEY);
      return true;
    }
    // Already counted, and no newer map fix to say they've moved: nothing to do (and no fix asked for).
    const seen = getLastView();
    if (before && (!seen || km(before, seen) < RECHECK_KM)) return false;
    const at = await whereNow();
    if (!at) return false;
    const { countryAt } = await import('@/lib/countryAt');
    const c = countryAt(at.lat, at.lng);
    // At sea, or somewhere the map doesn't number: keep what was there.
    if (c === null) return false;
    const changed = !before || before.c !== c;
    if (changed) {
      const { error } = await supabase.rpc('set_profile_country' as never, { _country: c } as never);
      if (error) return false;
    }
    localStorage.setItem(KEY, JSON.stringify({ c, lat: +at.lat.toFixed(1), lng: +at.lng.toFixed(1) }));
    return changed;
  } catch {
    return false;
  } finally {
    running = false;
  }
}
