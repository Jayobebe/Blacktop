/**
 * After a new version goes live, a page still running the previous build asks
 * for code files by their old names, which are gone, and the screen it was
 * opening fails ("error loading dynamically imported module"). The fix is to
 * load the page again, which picks up the new build. Once only: if it fails
 * again within a minute something else is wrong, and the error screen shows.
 */

const KEY = 'bt-new-build-reload';
const WINDOW_MS = 60_000;

/** The wording each browser uses for a code file that couldn't be fetched. */
export function isStaleBuildError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk \d+ failed/i.test(msg);
}

/** Loads the page again for the new build, unless that was just tried. True when reloading. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No session storage: reloading could loop, so show the error instead.
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite reports a failed preload of a screen's code or styles here: reload for the new build. */
export function installStaleBuildReload() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewBuild()) e.preventDefault();
  });
}
