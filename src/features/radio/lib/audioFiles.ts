/* eslint-disable @typescript-eslint/no-explicit-any -- File System Access
   and Media Session APIs aren't in the TS lib for this target. */
import type { RadioTrack } from '../types';
import { tr } from '@/lib/i18n';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeApp } from '@/lib/platform';

/** The Android app's folder picker (android/…/MusicFolderPlugin.java): the audio files directly inside a folder the rider chooses. */
const MusicFolder = registerPlugin<{ pick(): Promise<{ tracks: { name: string; uri: string }[]; cancelled: boolean }> }>('MusicFolder');
const androidApp = () => Capacitor.getPlatform() === 'android';

/** Where the radio plays a track from when it isn't a file in hand: a folder track's address in the Android app. */
export const trackSrc = (track: RadioTrack): string | null => (track.uri ? Capacitor.convertFileSrc(track.uri) : null);

/**
 * Files picked through a plain <input type="file"> can't be persisted, so we
 * keep them in memory for the current session and fall back to a "reselect"
 * prompt on the next launch. File System Access handles are persisted instead.
 */
const sessionFiles = new Map<string, File>();

export function rememberFile(trackId: string, file: File) {
  sessionFiles.set(trackId, file);
}

export function forgetFile(trackId: string) {
  sessionFiles.delete(trackId);
}

export function hasSessionFile(trackId: string) {
  return sessionFiles.has(trackId);
}

// The browser's own pickers aren't used in the Android and iOS apps: their web view may name these functions
// without having the pickers behind them (choosing a folder there did nothing at all). Files are picked with the
// phone's picker and kept with the track; a folder, on Android, through the app's own picker.
export function supportsFileSystemAccess() {
  return !isNativeApp() && typeof (window as any).showOpenFilePicker === 'function';
}

/** A folder can be picked: the browser's directory picker, or the Android app's own. */
export function supportsDirectoryPicker() {
  return androidApp() || (!isNativeApp() && typeof (window as any).showDirectoryPicker === 'function');
}

function makeId() {
  return `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAudioName(name: string) {
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$/i.test(name);
}

/** Verify (and if needed request) read permission for a persisted handle. */
export async function ensureHandlePermission(handle: FileSystemFileHandle, prompt = false): Promise<boolean> {
  const anyHandle = handle as any;
  if (typeof anyHandle.queryPermission !== 'function') return true;
  try {
    if ((await anyHandle.queryPermission({ mode: 'read' })) === 'granted') return true;
    if (!prompt) return false;
    return (await anyHandle.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/** Resolve a playable File for a track, or null when the user must reselect. */
export async function resolveTrackFile(track: RadioTrack): Promise<File | null> {
  const cached = sessionFiles.get(track.id);
  if (cached) return cached;
  if (track.file) {
    sessionFiles.set(track.id, track.file);
    return track.file;
  }
  if (!track.handle) return null;
  try {
    if (!(await ensureHandlePermission(track.handle, true))) return null;
    const file = await track.handle.getFile();
    sessionFiles.set(track.id, file);
    return file;
  } catch {
    return null;
  }
}

export interface PickResult {
  tracks: RadioTrack[];
  /** True when handles were persisted, so files survive a reload. */
  persistent: boolean;
}

/** Native audio-file picker. Uses File System Access when available. */
export async function pickAudioFiles(): Promise<PickResult> {
  if (supportsFileSystemAccess()) {
    try {
      const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [{ description: tr("Audio"), accept: { 'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac'] } }],
      });
      const tracks: RadioTrack[] = [];
      for (const handle of handles) {
        const id = makeId();
        try { rememberFile(id, await handle.getFile()); } catch { /* resolved later */ }
        tracks.push({ id, name: handle.name, handle });
      }
      return { tracks, persistent: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { tracks: [], persistent: true };
      // fall through to the input element
    }
  }
  return pickWithInput();
}

/** Folder picker — every audio file inside the chosen folder becomes a track. */
export async function pickAudioFolder(): Promise<PickResult> {
  if (!supportsDirectoryPicker()) return pickAudioFiles();
  if (androidApp()) {
    try {
      const { tracks } = await MusicFolder.pick();
      return { tracks: tracks.map((t) => ({ id: makeId(), name: t.name, uri: t.uri })).sort((a, b) => a.name.localeCompare(b.name)), persistent: true };
    } catch (err) {
      // An app built before the picker was added, or a phone without one: files instead.
      console.warn('[Radio] Folder picker unavailable', err);
      return pickAudioFiles();
    }
  }
  try {
    const dir: any = await (window as any).showDirectoryPicker({ mode: 'read' });
    const tracks: RadioTrack[] = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file' || !isAudioName(name)) continue;
      const id = makeId();
      try { rememberFile(id, await handle.getFile()); } catch { /* resolved later */ }
      tracks.push({ id, name, handle });
    }
    tracks.sort((a, b) => a.name.localeCompare(b.name));
    return { tracks, persistent: true };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { tracks: [], persistent: true };
    return pickAudioFiles();
  }
}

/** Baseline picker: <input type="file" multiple accept="audio/*">. */
export function pickWithInput(): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => { input.remove(); };

    input.onchange = () => {
      const files = Array.from(input.files || []);
      const tracks = files.map((file) => {
        const id = makeId();
        rememberFile(id, file);
        // In the app the file is kept with the track (saved with its station), so it's there next time.
        return (isNativeApp() ? { id, name: file.name, file } : { id, name: file.name }) as RadioTrack;
      });
      cleanup();
      resolve({ tracks, persistent: isNativeApp() });
    };
    // Safari fires no event on cancel; the promise simply never settles there,
    // which is harmless because the dialog is modal.
    input.click();
  });
}

/** Re-attach files to existing tracks by matching file names. */
export function reattachByName(tracks: RadioTrack[], files: File[]): number {
  let matched = 0;
  for (const track of tracks) {
    const file = files.find((f) => f.name === track.name);
    if (file) {
      rememberFile(track.id, file);
      matched++;
    }
  }
  return matched;
}
