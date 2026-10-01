import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Files the app makes (receipts, recap cards, GPX / CSV, ride videos) can't be
 * "downloaded" inside the native app: they're written to the app's cache and
 * handed to the phone's share sheet, where the rider saves them to Files /
 * Photos or sends them on. Written in chunks so a long ride video doesn't need
 * the whole file as one base64 string. Native app only (see lib/platform).
 */
const CHUNK = 3 * 1024 * 1024; // a multiple of 3, so each chunk's base64 joins cleanly

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Shares a file through the share sheet: true once sent / saved, false if the rider closed it. */
export async function shareFileNative(name: string, data: Blob | string, title?: string): Promise<boolean> {
  const blob = typeof data === 'string' ? new Blob([data]) : data;
  const path = `share/${name}`;
  for (let at = 0; at < blob.size || at === 0; at += CHUNK) {
    const part = toBase64(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()));
    if (at === 0) await Filesystem.writeFile({ path, data: part, directory: Directory.Cache, recursive: true });
    else await Filesystem.appendFile({ path, data: part, directory: Directory.Cache });
    if (blob.size === 0) break;
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  try {
    await Share.share({ title: title ?? name, files: [uri] });
    return true;
  } catch (e) {
    // Closing the share sheet rejects; that's not an error.
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}
