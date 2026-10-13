import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Anonymous usage counts (migration 20261027000000_usage_counts.sql): the app
 * adds one to a daily tally on the server when it's opened and when a ride
 * starts or ends. The tally is numbers by day and kind of device; nothing in
 * it says who, where or what was ridden. Everything here is fire-and-forget:
 * a server without the function, no connection or demo mode just means
 * nothing is counted.
 */
type UsageEvent = 'open_new' | 'open_week' | 'open_month' | 'open_old' | 'ride' | 'ride_convoy' | 'ride_done';

const DAY_KEY = 'blacktop_usage_day';
const PROFILE_KEY = 'blacktop_profile';

function platform(): 'web' | 'pwa' | 'ios' | 'android' | 'nimiq' {
  const native = Capacitor.getPlatform();
  if (native === 'ios' || native === 'android') return native;
  if (!__STORE_BUILD__ && (window as unknown as { nimiqPay?: unknown }).nimiqPay) return 'nimiq';
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed ? 'pwa' : 'web';
}

/** Adds one to today's tally for `event`. Resolves to whether the server took it. */
export async function countUsage(event: UsageEvent): Promise<boolean> {
  if (isDemoModeActive()) return false;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    const { error } = await supabase.rpc('usage_count' as never, { _event: event, _platform: platform() } as never);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Days since this rider set up (0 today; null when not set up yet): by the
 * date on the phone's profile, or, for a profile that came from the server
 * without one (an account recovered by its code), the account's own.
 */
async function daysSinceSetup(): Promise<number | null> {
  let made = NaN;
  let named = false;
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as { name?: string; createdAt?: string };
    named = !!profile.name;
    made = Date.parse(profile.createdAt ?? '');
  } catch {
    return null;
  }
  if (!named) return null;
  if (!Number.isFinite(made)) {
    try {
      made = Date.parse((await supabase.auth.getSession()).data.session?.user.created_at ?? '');
    } catch {
      return null;
    }
  }
  return Number.isFinite(made) ? Math.max(0, Math.floor((Date.now() - made) / 86_400_000)) : null;
}

/**
 * Counts this device as having opened the app today, once a (UTC) day, under
 * how long ago it was set up. The age is worked out here, from the profile's
 * own date, so the server can tell riders coming back from new ones without
 * knowing who anyone is.
 */
export async function countOpen(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(DAY_KEY) === today) return;
  } catch {
    return; // no storage to remember the day in: it would count on every launch
  }
  const age = await daysSinceSetup();
  if (age === null) return; // not set up yet
  const event: UsageEvent = age === 0 ? 'open_new' : age < 7 ? 'open_week' : age < 30 ? 'open_month' : 'open_old';
  if (await countUsage(event)) {
    try {
      localStorage.setItem(DAY_KEY, today);
    } catch {
      /* counted; it may count again today */
    }
  }
}
