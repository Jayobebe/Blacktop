// One-release cleanup for the old app-shell service worker.
// Keeps install metadata, but prevents stale published builds from being served.

const SW_URL = "/sw.js";

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
  void unregisterMatching();
}

/** Returns true if a new version is now waiting to install. */
export async function checkForAppUpdate(): Promise<boolean> {
  if (shouldSkip()) return false;
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
    setHasUpdate(true);
    return true;
  } catch {
    return hasUpdate;
  }
}

/** Activates the waiting SW and reloads. Local data (rides, garage, settings) is preserved. */
export async function applyAppUpdate(): Promise<void> {
  await unregisterMatching();
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
