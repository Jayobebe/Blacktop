/**
 * Burn: everything Blacktop keeps on this device. Every localStorage /
 * sessionStorage key the app writes starts with `blacktop` or `bt.` (keep it
 * that way for new keys), the app's IndexedDB databases are listed here, and
 * `blacktop*` Cache Storage caches (the pilot voice) go too.
 * The feature-level burns (rides, garage, radio, push…) still run first for
 * their side effects; this is the sweep that makes sure nothing is left.
 *
 * Not touched: Supabase's own auth keys (signOut clears them) and anything
 * that isn't Blacktop's.
 */
const KEY_PREFIXES = ['blacktop', 'bt.', 'bt-'];
const DATABASES = ['blacktop_overlays', 'blacktop_tile_cache', 'blacktop-radio'];

function sweep(storage: Storage | undefined) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && KEY_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch (e) {
    console.warn('[Burn] storage sweep failed', e);
  }
}

export async function burnLocalDevice(): Promise<void> {
  sweep(typeof localStorage !== 'undefined' ? localStorage : undefined);
  sweep(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
  // Cache Storage (the pilot voice) and the voice library's OPFS folder.
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('blacktop')).map((n) => caches.delete(n)));
    }
  } catch {
    /* no Cache Storage here */
  }
  try {
    const root = await navigator.storage?.getDirectory?.();
    await (root as unknown as { removeEntry?: (n: string, o: { recursive: boolean }) => Promise<void> })?.removeEntry?.('piper', { recursive: true });
  } catch {
    /* nothing there */
  }
  if (typeof indexedDB === 'undefined') return;
  // Radio stations live in their own database; check its real name too.
  const names = new Set(DATABASES);
  try {
    const list = await (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases?.();
    list?.forEach((d) => d.name && d.name.startsWith('blacktop') && names.add(d.name));
  } catch {
    /* databases() isn't everywhere; the known names still go */
  }
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
}
