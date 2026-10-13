/**
 * What a picked file really is, read from its first bytes. A file's `type`
 * can't be relied on: Android's picker hands the app files with no type at
 * all (and names like "image:1234"), so checking `file.type` turned real
 * photos away in the Android app. This file imports nothing.
 */
export type ImageKind = 'png' | 'webp' | 'jpeg' | 'gif' | 'heic' | 'avif' | 'bmp';

export function imageKindOf(bytes: Uint8Array): ImageKind | null {
  const at = (i: number, ...want: number[]) => want.every((b, k) => bytes[i + k] === b);
  const text = (i: number, n: number) => String.fromCharCode(...bytes.slice(i, i + n));
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') return 'webp';
  if (text(0, 3) === 'GIF') return 'gif';
  if (text(0, 2) === 'BM') return 'bmp';
  if (text(4, 4) === 'ftyp') {
    const brand = text(8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return null;
}

/** The kind of picture a file is, or null if it isn't one. */
export async function imageKind(file: Blob): Promise<ImageKind | null> {
  try {
    return imageKindOf(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  } catch {
    return null;
  }
}

/** Android (the app and its browsers): pickers there are better left open, with the file checked after. */
export const isAndroid = (): boolean => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
