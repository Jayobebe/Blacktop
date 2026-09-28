export interface LatLng {
  lat: number;
  lng: number;
}

/** A timing line across the track: start/finish or a sector split. */
export interface Gate {
  a: LatLng;
  b: LatLng;
}

export interface TrackDef {
  id: string;
  name: string;
  startFinish: Gate;
  /** Sector split lines in running order (any number). Sectors = splits + 1. */
  splits: Gate[];
  createdAt: number;
  /** The lap, starting at the start/finish, in running order (minimaps, re-editing). */
  outline?: LatLng[];
  /** Pinned to the top of Track Pack. */
  starred?: boolean;
  /** How it was made: picked on the map, recorded with GPS, or from the circuit library. */
  source?: 'map' | 'gps' | 'library';
  /** Circuit library (OpenStreetMap relation) id, when imported from it. */
  osmId?: number;
  /** Last picked, readied up or saved (for the Previous tracks list). */
  lastUsedAt?: number;
}

/** One telemetry sample, at GPS rate with the latest lean / G merged in. */
export interface TelemetrySample {
  t: number; // device epoch ms
  lat: number;
  lng: number;
  v: number; // m/s
  lean?: number; // degrees, + right / - left
  g?: number;
  lap: number; // 0 = out lap
  d: number; // metres into the current lap
}

export interface Lap {
  n: number; // 1-based
  startT: number;
  endT: number;
  ms: number;
  /** Sector times in ms (length = splits + 1) — empty when a split was missed. */
  sectors: number[];
  valid: boolean;
  /** Fix gaps / poor accuracy around a line: timing less certain. */
  lowConfidence: boolean;
  maxSpeed: number; // m/s
  maxLean?: number;
  distance: number; // metres
}

export interface TrackSession {
  id: string;
  trackId: string;
  trackName: string;
  startedAt: number;
  endedAt: number;
  laps: Lap[];
  samples: TelemetrySample[];
  splitsCount: number;
  bikeId?: string;
  riderName: string;
}

/** Pit board: crew → racer. */
export const PIT_PRESETS = ['BOX', 'PUSH', 'OK', 'FUEL', 'SLOW', 'LAST LAP', 'P+1', 'P-1'] as const;
/** Racer → crew, one tap. */
export const RIDER_CALLS = ['Coming in', 'Problem', 'All good'] as const;

export interface PitMessage {
  id: string;
  text: string;
  at: number;
  from: 'crew' | 'rider';
}
