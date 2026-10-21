/**
 * What the phone lets Blacktop keep, and how much it keeps now: the browser's
 * own estimate (approximate, and rough on an iPhone), shared by the Storage
 * page and the low-storage notice. Imports nothing, so App can use it cheaply.
 */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || typeof est.quota !== 'number') return null;
    return { usage: est.usage ?? 0, quota: est.quota };
  } catch {
    return null;
  }
}

/** 950 KB, 12.4 MB, 1.8 GB. */
export function bytesText(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(bytes > 0 ? 1 : 0, Math.round(bytes / 1024))} KB`;
}

/** Bytes Blacktop keeps in local storage (its `blacktop*` / `bt.` keys: rides, garage, settings…). */
export function localStorageBytes(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !(k.startsWith('blacktop') || k.startsWith('bt.'))) continue;
      n += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
    }
  } catch {
    // Unreadable: nothing counted.
  }
  return n;
}

/** Asks the browser to keep Blacktop's storage when the phone runs low; whether it already does. */
export async function storagePersisted(): Promise<boolean | null> {
  try {
    return typeof navigator.storage?.persisted === 'function' ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
export async function requestPersist(): Promise<boolean> {
  try {
    return typeof navigator.storage?.persist === 'function' ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}
