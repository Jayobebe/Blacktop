import { Capacitor } from '@capacitor/core';

/**
 * Web (browser, home-screen app, the Nimiq Pay mini app) vs the native
 * iOS / Android app. Everything here answers exactly as before on the web;
 * only the native app differs.
 */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** The public site: links shared out of the app point here, never at the app's own origin. */
export const PUBLIC_ORIGIN = 'https://blacktoplive.com';

/** Origin for links other people open. On the web it's the page's own origin (unchanged). */
export function shareOrigin(): string {
  return isNativeApp() ? PUBLIC_ORIGIN : window.location.origin;
}

/**
 * Crypto payments (Pay Up tips, Blacktank, /pay through Nimiq Pay) are web and
 * mini-app only: the app stores don't allow them in a store app.
 */
export const paymentsAvailable = (): boolean => !isNativeApp();
