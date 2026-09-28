import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { whenPwaCleanedUp } from '@/pwa';
import { isDemoModeActive } from '@/lib/demoMode';
import { getCrewCode } from '@/features/crew/useCrew';

/**
 * Push notifications (Web Push) for the installed web app.
 *
 * Turning them on (from a tap) asks the browser for permission, registers the
 * notifications worker, subscribes with the server's VAPID key and stores the
 * subscription via `register_push_subscription`. On every launch `syncPush()`
 * re-registers, which keeps the endpoint current and moves the device to
 * whoever is signed in now.
 */

const SW_URL = '/push-sw.js';
const PREF_KEY = 'bt.push.enabled.v1';

const CATEGORIES_KEY = 'bt.push.categories.v1';
const LOCATION_KEY = 'bt.push.location.v1';

/** Kinds of notification a device can switch on or off (ids match send-push). */
export const PUSH_CATEGORY_DEFS = [
  { id: 'rescue', label: 'Rescue calls', desc: 'A convoy or crew mate calls for rescue, with where they are' },
  { id: 'rescue_nearby', label: 'Riders near me who need help', desc: 'Another rider close by calls for rescue. Keeps this phone’s rough area (about 11 km) on the server' },
  { id: 'weather', label: 'Heavy weather', desc: 'Storms, heavy rain, snow or strong winds heading to your area' },
  { id: 'blacktank', label: 'Blacktank', desc: 'Requests to vote on, approvals, chip-ins and payouts' },
  { id: 'timeattack', label: 'Your time attacks', desc: 'Someone beats, or loses to, a time attack you set' },
  { id: 'card_pickups', label: 'Card pickups', desc: 'Someone picks up a card you dropped' },
  { id: 'leaderboard', label: 'Crew leaderboard', desc: 'A crew mate passes you on the crew board' },
  { id: 'crew_convoys', label: 'Crew convoys', desc: 'A crew mate opens an unlocked convoy you can join' },
  { id: 'challenges', label: 'Crew challenges', desc: 'Targets hit, weekly and monthly results, and a 5-days-left nudge' },
  { id: 'maintenance', label: 'Maintenance', desc: 'Service items coming due or overdue' },
] as const;

export type PushCategory = (typeof PUSH_CATEGORY_DEFS)[number]['id'];
const ALL_CATEGORIES = PUSH_CATEGORY_DEFS.map((d) => d.id) as PushCategory[];

function readCategories(): PushCategory[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return ALL_CATEGORIES;
    const saved = JSON.parse(raw) as string[];
    return ALL_CATEGORIES.filter((c) => saved.includes(c));
  } catch {
    return ALL_CATEGORIES;
  }
}

export type PushSupport =
  | 'supported'
  | 'needs-install' // iPhone / iPad: only works from the Home Screen app
  | 'in-frame' // an embedded preview can't ask for permission
  | 'native-app' // the Capacitor shell needs native push instead
  | 'unsupported';

export interface PushState {
  support: PushSupport;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
  busy: boolean;
  error: string | null;
  /** Which kinds of notification this device wants. */
  categories: PushCategory[];
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function inFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function detectSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (Capacitor.isNativePlatform()) return 'native-app';
  if (inFrame()) return 'in-frame';
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'needs-install';
  return apis ? 'supported' : 'unsupported';
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* storage unavailable: the subscription itself still works */
  }
}

let state: PushState = {
  support: detectSupport(),
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  enabled: false,
  busy: false,
  error: null,
  categories: readCategories(),
};
const listeners = new Set<() => void>();

function set(patch: Partial<PushState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePush(): PushState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function getPushState() {
  return state;
}

/** Re-reads the browser permission (e.g. after the rider changed it in phone settings). */
export function refreshPushPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== state.permission) set({ permission: Notification.permission });
}

// ── plumbing ────────────────────────────────────────────────────────────────

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  await whenPwaCleanedUp();
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  if (reg.active) return reg;
  return navigator.serviceWorker.ready;
}

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

class PushSetupError extends Error {}

// ── weather location ────────────────────────────────────────────────────────
// Only ever sent rounded (the server keeps 0.1°, about 11 km). Comes from the
// end of the last ride when there is one, otherwise a quick low-accuracy fix,
// and never triggers a location prompt in the background.

interface KnownLocation {
  lat: number;
  lng: number;
  at: number;
}

function readLocation(): KnownLocation | null {
  try {
    const l = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null') as KnownLocation | null;
    return l && Number.isFinite(l.lat) && Number.isFinite(l.lng) ? l : null;
  } catch {
    return null;
  }
}

/** Remembers where the rider last was (e.g. the end of a ride) for weather alerts. */
export function rememberPushLocation(lat: number, lng: number, at = Date.now()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const known = readLocation();
  if (known && known.at >= at) return;
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, at }));
  } catch {
    /* not fatal */
  }
}

async function weatherLocation(): Promise<{ lat: number; lng: number } | null> {
  const known = readLocation();
  if (known && Date.now() - known.at < 6 * 3600000) return known;
  if (!navigator.geolocation || !navigator.permissions?.query) return known;
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (perm.state !== 'granted') return known;
  } catch {
    return known;
  }
  const fix = await new Promise<{ lat: number; lng: number } | null>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 30 * 60000, timeout: 8000 },
    ),
  );
  if (fix) rememberPushLocation(fix.lat, fix.lng);
  return fix ?? known;
}

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new PushSetupError(`Couldn't sign in to Blacktop (${error.message}). Check your connection and try again.`);
}

async function serverPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'config' } });
  if (error || !data?.publicKey) {
    const ctx = (error as { context?: unknown } | null)?.context;
    const status = ctx instanceof Response ? ctx.status : undefined;
    if (status === 503 || status === 404) {
      throw new PushSetupError("Notifications aren't switched on for Blacktop's server yet.");
    }
    // Say what failed, so a screenshot is enough to diagnose it.
    const detail = status ? `error ${status}` : error ? error.name || 'network error' : 'no key returned';
    throw new PushSetupError(`Couldn't reach Blacktop's notification server (${detail}). Check your connection and try again.`);
  }
  return String(data.publicKey);
}

/** Subscribes this device (re-using a valid existing subscription) and stores it server-side. */
async function subscribeAndRegister(reg: ServiceWorkerRegistration) {
  await ensureSession();
  const key = base64UrlToBytes(await serverPublicKey());
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    // The server's keys changed: the old subscription can't be used any more.
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const json = sub.toJSON();
  // Rough area (rounded server-side to ~11 km) for weather alerts and for helping nearby riders.
  const loc = state.categories.includes('weather') || state.categories.includes('rescue_nearby') ? await weatherLocation() : null;
  const { error } = await supabase.rpc('register_push_subscription' as never, {
    _endpoint: sub.endpoint,
    _p256dh: json.keys?.p256dh ?? '',
    _auth: json.keys?.auth ?? '',
    _categories: state.categories,
    _user_agent: navigator.userAgent,
    _crew_code: getCrewCode(),
    _lat: loc?.lat ?? null,
    _lng: loc?.lng ?? null,
  } as never);
  if (error) throw new PushSetupError(`Couldn't register this device (${error.code || error.message}). Try again in a moment.`);
}

function message(err: unknown) {
  return err instanceof PushSetupError ? err.message : 'Something went wrong turning notifications on.';
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Turns notifications on. Call straight from a tap (browsers require it). */
export async function enablePush(): Promise<boolean> {
  if (state.support !== 'supported' || state.busy) return false;
  set({ busy: true, error: null });
  try {
    // Ask first, before any other await, so the tap still counts as the gesture.
    const permission = await Notification.requestPermission();
    set({ permission });
    if (permission !== 'granted') {
      set({ busy: false, enabled: false });
      return false;
    }
    // Remember the choice now: if the server isn't reachable yet, every
    // launch retries (syncPush) until the device is registered.
    writePref(true);
    const reg = await registerWorker();
    await subscribeAndRegister(reg);
    set({ enabled: true, busy: false });
    return true;
  } catch (err) {
    console.warn('[Push] enable failed', err);
    set({ busy: false, enabled: false, error: message(err) });
    return false;
  }
}

/** Turns notifications off on this device (also used by the Burn button). */
export async function disablePush(): Promise<void> {
  writePref(false);
  set({ busy: true, error: null });
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await supabase.rpc('set_push_reminders' as never, { _category: 'maintenance', _reminders: [] } as never);
        lastReminders = '';
        await supabase.rpc('unregister_push_subscription' as never, { _endpoint: sub.endpoint } as never);
        await sub.unsubscribe().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Push] disable failed', err);
  } finally {
    set({ enabled: false, busy: false });
  }
}

/** On launch: keep this device's subscription current if notifications are on. */
export async function syncPush(): Promise<void> {
  const support = detectSupport();
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  set({ support, permission });
  if (!readPref() || support !== 'supported') return;
  if (permission !== 'granted') {
    // Permission was withdrawn in the browser / phone settings.
    set({ enabled: false });
    return;
  }
  try {
    const reg = await registerWorker();
    await subscribeAndRegister(reg);
    set({ enabled: true, error: null });
  } catch (err) {
    console.warn('[Push] sync failed', err);
    // Not registered yet; the next launch (or the Settings switch) retries.
    set({ enabled: false });
  }
}

/** Sends a test notification to this rider's devices (optionally 10 s later). */
export async function sendTestPush(delayed = false): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'test', delayed } });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 429) return { ok: false, message: 'Too many tests. Try again in a few minutes.' };
    if (status === 503) return { ok: false, message: "Notifications aren't switched on for Blacktop's server yet." };
    return { ok: false, message: 'Could not send a test notification.' };
  }
  if (!data?.devices) return { ok: false, message: 'This device isn\'t registered. Turn notifications off and on again.' };
  if (data.queued) return { ok: true, message: 'Close Blacktop or lock your phone now. It arrives in about 10 seconds.' };
  if (!data.sent) return { ok: false, message: 'The push service refused it. Turn notifications off and on again.' };
  return { ok: true, message: 'Sent. It should appear in a moment.' };
}

// ── per-kind switches ───────────────────────────────────────────────────────

let resyncTimer: number | null = null;

/** Re-registers soon (debounced) so the server has the latest switches / crew / location. */
export function schedulePushResync(delayMs = 800) {
  if (!readPref()) return;
  if (resyncTimer) window.clearTimeout(resyncTimer);
  resyncTimer = window.setTimeout(() => {
    resyncTimer = null;
    void syncPush();
  }, delayMs);
}

export function setPushCategory(id: PushCategory, on: boolean) {
  const next = on ? [...new Set([...state.categories, id])] : state.categories.filter((c) => c !== id);
  const ordered = ALL_CATEGORIES.filter((c) => next.includes(c));
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(ordered));
  } catch {
    /* not fatal */
  }
  set({ categories: ordered });
  schedulePushResync();
}

export function wantsPush(id: PushCategory) {
  return state.enabled && state.permission === 'granted' && state.categories.includes(id);
}

// ── sending ─────────────────────────────────────────────────────────────────

export interface RescueNotice {
  convoyId?: string | null;
  /** Crew to tell: left out = this device's crew; null = don't tell the crew. */
  crewCode?: string | null;
  lat: number;
  lng: number;
  /** Fired by crash detection rather than the rider. */
  auto?: boolean;
  /** Also reach opted-in riders within this many km. */
  nearbyKm?: number | null;
}

const crewFor = (code: string | null | undefined) => (code === undefined ? getCrewCode() : code);

/** Tells this rider's convoy and crew they need rescue. Works even with notifications off here. */
export async function notifyRescue(n: RescueNotice): Promise<{ sent: number }> {
  if (isDemoModeActive()) return { sent: 0 };
  try {
    await ensureSession();
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { action: 'rescue', convoyId: n.convoyId ?? null, crewCode: crewFor(n.crewCode), lat: n.lat, lng: n.lng, auto: !!n.auto, nearbyKm: n.nearbyKm ?? null },
    });
    return { sent: error ? 0 : Number(data?.sent) || 0 };
  } catch {
    return { sent: 0 };
  }
}

export async function notifyRescueCancel(n: Omit<RescueNotice, 'lat' | 'lng' | 'auto'> & { lat?: number; lng?: number } = {}): Promise<void> {
  if (isDemoModeActive()) return;
  try {
    await supabase.functions.invoke('send-push', {
      body: { action: 'rescue_cancel', convoyId: n.convoyId ?? null, crewCode: crewFor(n.crewCode), nearbyKm: n.nearbyKm ?? null, lat: n.lat ?? null, lng: n.lng ?? null },
    });
  } catch {
    /* best effort */
  }
}

let lastNudge = 0;

/**
 * Asks the server to send anything the database just queued. The database
 * normally does this itself; this is the fallback when it can't.
 */
export function nudgePush() {
  if (isDemoModeActive() || Date.now() - lastNudge < 3000) return;
  lastNudge = Date.now();
  void supabase.functions.invoke('send-push', { body: { action: 'drain' } }).catch(() => {});
}

/** A notification from this phone itself (no server), if the rider wants that kind. */
export async function showLocalNotification(
  kind: PushCategory,
  n: { title: string; body: string; tag?: string; url?: string },
): Promise<void> {
  if (!wantsPush(kind) || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    await reg?.showNotification(n.title, { body: n.body, icon: '/pwa-192x192.png', tag: n.tag, data: { url: n.url ?? '/' } });
  } catch (err) {
    console.warn('[Push] local notification failed', err);
  }
}

export interface PushReminder {
  key: string;
  title: string;
  body: string;
  url?: string;
  /** ISO time to send it. */
  due_at: string;
}

let lastReminders = '';

/** Hands the server this rider's upcoming time-based reminders of one kind (replacing the old set). */
export async function syncPushReminders(kind: 'maintenance', reminders: PushReminder[]): Promise<void> {
  if (isDemoModeActive()) return;
  const list = wantsPush(kind) ? reminders : [];
  const sig = JSON.stringify([kind, list]);
  if (sig === lastReminders) return;
  try {
    await ensureSession();
    const { error } = await supabase.rpc('set_push_reminders' as never, { _category: kind, _reminders: list } as never);
    if (!error) lastReminders = sig;
  } catch {
    /* retried on the next change */
  }
}
