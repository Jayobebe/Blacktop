import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive, useDemoMode } from '@/lib/demoMode';

/**
 * Server features the app ships ahead of: their UI stays hidden until the
 * server has them (migrations go out separately, through Lovable). Each one is
 * probed once per launch, once there's a session, with a harmless read RPC:
 * "function not found" (PGRST202) means not yet; any answer from the function
 * itself, even a permission error, means it's there. Offline keeps the last answer (stored),
 * and a feature never seen is off. Demo mode shows everything (demo data).
 */
export type ServerCap = 'trackRecords' | 'cardWars' | 'worldCountries';

const PROBES: Record<ServerCap, () => PromiseLike<{ error: { code?: string } | null }>> = {
  cardWars: () => supabase.rpc('cw_available' as never),
  // Blacktop World's globe glowing by accounts per country, and its list (lib/profileCountry.ts).
  worldCountries: () => supabase.rpc('profile_country_counts' as never),
  trackRecords: () =>
    supabase.rpc('track_leaderboard' as never, { _osm_id: -1, _direction: 'cw', _vehicle_class: 'motorcycle', _limit: 1 } as never),
};

const KEY = 'bt.server_caps';

function load(): Partial<Record<ServerCap, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

let caps = load();
const listeners = new Set<() => void>();
let probed = false;

function set(cap: ServerCap, on: boolean) {
  if (caps[cap] === on) return;
  caps = { ...caps, [cap]: on };
  try {
    localStorage.setItem(KEY, JSON.stringify(caps));
  } catch {
    /* kept for this launch only */
  }
  listeners.forEach((l) => l());
}

function ask() {
  for (const cap of Object.keys(PROBES) as ServerCap[]) {
    Promise.resolve(PROBES[cap]())
      .then(({ error }) => {
        if (!error) set(cap, true);
        else if (error.code === 'PGRST202' || error.code === '42883') set(cap, false);
        // A sign-in problem (PGRST3xx) says nothing about the feature; no code at all means the
        // request never reached the database (offline). Either way, keep what we knew.
        else if (error.code && !error.code.startsWith('PGRST3')) set(cap, true);
      })
      .catch(() => {});
  }
}

/**
 * Asks the server once per launch (App.tsx), and only as a signed-in rider:
 * before onboarding there's no session, every call would just be refused, so
 * it waits for the first sign-in instead.
 */
export function probeServerCaps() {
  if (probed) return;
  probed = true;
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      if (data.session) return ask();
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) return;
        sub.subscription.unsubscribe();
        ask();
      });
    })
    .catch(() => {});
}

export function hasServerCap(cap: ServerCap): boolean {
  return isDemoModeActive() || !!caps[cap];
}

export function useServerCap(cap: ServerCap): boolean {
  const demo = useDemoMode().enabled;
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => !!caps[cap],
    () => !!caps[cap],
  );
  return demo || on;
}
