import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { hasServerCap } from '@/lib/serverCaps';
import { getLastView } from '@/features/map/lib/lastView';

/**
 * The rider's country, for Blacktop World's globe (which glows by where
 * accounts are). The phone works it out from its last known position and sends
 * only the country's number; the position stays here. It's part of Blacktop
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
    const at = getLastView();
    if (!at || (before && km(before, at) < RECHECK_KM)) return false;
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
