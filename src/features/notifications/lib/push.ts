import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { whenPwaCleanedUp } from '@/pwa';

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

/** Kinds of notification this device accepts; filled in as they're chosen. */
export const PUSH_CATEGORIES: string[] = [];

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

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new PushSetupError('Could not reach Blacktop. Check your connection and try again.');
}

async function serverPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'config' } });
  if (error || !data?.publicKey) {
    const ctx = (error as { context?: Response } | null)?.context;
    const status = ctx?.status;
    if (status === 503 || status === 404) {
      throw new PushSetupError("Notifications aren't switched on for Blacktop's server yet.");
    }
    throw new PushSetupError('Could not reach Blacktop. Check your connection and try again.');
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
  const { error } = await supabase.rpc('register_push_subscription' as never, {
    _endpoint: sub.endpoint,
    _p256dh: json.keys?.p256dh ?? '',
    _auth: json.keys?.auth ?? '',
    _categories: PUSH_CATEGORIES,
    _user_agent: navigator.userAgent,
  } as never);
  if (error) throw new PushSetupError('Could not register this device. Try again in a moment.');
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
