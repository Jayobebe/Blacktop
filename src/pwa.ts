// Guarded PWA service worker registration.
// Skips Lovable preview/dev so the editor never caches stale builds.
import { registerSW } from "virtual:pwa-register";

const SW_URL = "/sw.js";

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let hasUpdate = false;
const updateListeners = new Set<(available: boolean) => void>();

function setHasUpdate(v: boolean) {
  hasUpdate = v;
  updateListeners.forEach((cb) => cb(v));
}

function shouldSkip(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => r.active?.scriptURL.endsWith(SW_URL) || r.installing?.scriptURL.endsWith(SW_URL) || r.waiting?.scriptURL.endsWith(SW_URL))
        .map((r) => r.unregister()),
    );
  } catch {
    /* noop */
  }
}

export function setupPWA() {
  if (shouldSkip()) {
    void unregisterMatching();
    return;
  }
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setHasUpdate(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Poll every 30 min in case the user keeps the app open
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    },
  });
}

/** Returns true if a new version is now waiting to install. */
export async function checkForAppUpdate(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const target = regs.find(
      (r) =>
        r.active?.scriptURL.endsWith(SW_URL) ||
        r.waiting?.scriptURL.endsWith(SW_URL) ||
        r.installing?.scriptURL.endsWith(SW_URL),
    );
    if (!target) return hasUpdate;
    await target.update();
    // Give the browser a moment to detect a waiting worker
    await new Promise((r) => setTimeout(r, 800));
    if (target.waiting) setHasUpdate(true);
    return hasUpdate;
  } catch {
    return hasUpdate;
  }
}

/** Activates the waiting SW and reloads. Local data (rides, garage, settings) is preserved. */
export async function applyAppUpdate(): Promise<void> {
  if (updateSW) {
    await updateSW(true);
    return;
  }
  window.location.reload();
}

export function isUpdateAvailable() {
  return hasUpdate;
}

export function onUpdateAvailable(cb: (available: boolean) => void) {
  updateListeners.add(cb);
  cb(hasUpdate);
  return () => updateListeners.delete(cb);
}
