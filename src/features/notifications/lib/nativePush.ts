import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { tr } from '@/lib/i18n';

/**
 * Push in the native store app (@capacitor/push-notifications): Firebase Cloud
 * Messaging on Android, APNs on iOS. The device's token is registered like a
 * web subscription, as the endpoint "fcm:<token>" / "apns:<token>", and
 * send-push (native.ts) delivers it.
 *
 * Built in only with VITE_NATIVE_PUSH=1, set for the store build once Firebase
 * (android/app/google-services.json) and the iOS Push Notifications capability
 * are in place: on Android, registering without Firebase crashes the app.
 * Without it the native app shows notifications as unavailable, as before.
 */
export const nativePushAvailable = (): boolean =>
  import.meta.env.VITE_NATIVE_PUSH === '1' && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');

const asPermission = (p: string): NotificationPermission => (p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default');

export async function nativePermission(): Promise<NotificationPermission> {
  return asPermission((await PushNotifications.checkPermissions()).receive);
}

/** Asks for permission (from a tap). */
export async function requestNativePermission(): Promise<NotificationPermission> {
  return asPermission((await PushNotifications.requestPermissions()).receive);
}

let channelsMade = false;

/** Android channels: rescue calls loud and on the lock screen, the rest normal. */
async function ensureChannels() {
  if (channelsMade || Capacitor.getPlatform() !== 'android') return;
  channelsMade = true;
  await PushNotifications.createChannel({ id: 'rescue', name: tr("Rescue calls"), importance: 5, visibility: 1, vibration: true }).catch(() => {});
  await PushNotifications.createChannel({ id: 'general', name: 'Blacktop', importance: 3, visibility: 0 }).catch(() => {});
}

let endpoint: Promise<string> | null = null;

/** This device's endpoint ("fcm:…" / "apns:…"); registers with the OS the first time. */
export function nativePushEndpoint(): Promise<string> {
  if (endpoint) return endpoint;
  endpoint = new Promise<string>((resolve, reject) => {
    const prefix = Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm';
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void ok.then((h) => h.remove());
      void bad.then((h) => h.remove());
      fn();
    };
    const ok = PushNotifications.addListener('registration', (t) => finish(() => resolve(`${prefix}:${t.value}`)));
    const bad = PushNotifications.addListener('registrationError', (e) => finish(() => reject(new Error(e.error))));
    const timer = setTimeout(() => finish(() => reject(new Error('no token'))), 20000);
    void ensureChannels()
      .then(() => PushNotifications.register())
      .catch((e) => finish(() => reject(e)));
  });
  // A failure isn't kept: the next try registers again.
  endpoint.catch(() => {
    endpoint = null;
  });
  return endpoint;
}

export async function unregisterNativePush(): Promise<void> {
  endpoint = null;
  await PushNotifications.unregister().catch(() => {});
}

/** Tapping a notification opens its page (the same `url` the web worker uses). */
export function onNativePushTap(open: (path: string) => void): () => void {
  if (!nativePushAvailable()) return () => {};
  const handle = PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = (a.notification.data as { url?: unknown } | undefined)?.url;
    if (typeof url !== 'string') return;
    try {
      const u = new URL(url, 'https://blacktoplive.com');
      if (u.pathname.startsWith('/')) open(u.pathname + u.search);
    } catch {
      /* not a link we know */
    }
  });
  return () => {
    void handle.then((h) => h.remove());
  };
}
