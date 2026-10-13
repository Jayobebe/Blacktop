import type { AccentColor } from '@/features/settings';

export type RadioIcon = 'radio' | 'music' | 'disc' | 'guitar' | 'mic' | 'headphones';

export interface RadioTrack {
  id: string;
  /** File name as chosen by the user — the only thing we can always persist. */
  name: string;
  /**
   * File System Access handle, persisted in IndexedDB where the browser
   * supports it. Absent on iOS Safari and plain <input type="file"> picks,
   * in which case the track only plays for the current session.
   */
  handle?: FileSystemFileHandle;
  /**
   * The file itself, kept with the station in the Android and iOS apps, which
   * have no file handles: the app holds its own copy, so a station still
   * plays after a restart.
   */
  file?: File;
  /**
   * The Android app, for a track from a picked folder: the address Android
   * gave for the file. The app keeps the right to read that folder, so the
   * radio plays it from where it is, with nothing copied.
   */
  uri?: string;
}

export interface RadioStation {
  id: string;
  name: string;
  color: AccentColor;
  icon: RadioIcon;
  tracks: RadioTrack[];
  createdAt: string;
  /** Built-in live internet station: streamed, no tracks. */
  streamUrl?: string;
}

export interface RadioPlayerState {
  stationId: string | null;
  stationName: string | null;
  /** Shuffled queue of track ids for the active station. */
  queue: string[];
  index: number;
  trackName: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  /** Set when files can't be read back and the user must reselect them. */
  needsReselect: boolean;
}
