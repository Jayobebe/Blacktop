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
 * mini-app only: the app stores don't allow them in a store app. In the store
 * build their code isn't there at all (`__STORE_BUILD__`, see vite-env.d.ts):
 * call sites write `!__STORE_BUILD__ && paymentsAvailable()` so it folds away.
 */
export const paymentsAvailable = (): boolean => !__STORE_BUILD__ && !isNativeApp();

/**
 * The app's pages live at `https://localhost` (`capacitor://localhost` on
 * iOS), and that's what it would name as the referrer on every request it
 * makes. Some hosts turn that address away: SomaFM answered 403 to every live
 * radio station in the Android app ("Stream unavailable"). The address says
 * nothing useful to anyone, so the app sends none. The web is unchanged.
 */
export function hideAppReferrer(): void {
  if (!isNativeApp() || document.querySelector('meta[name="referrer"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'referrer';
  meta.content = 'no-referrer';
  document.head.appendChild(meta);
}
