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
  /** Pit lane timing lines (lib/pits `pitGates`), on the pit lane itself, off the racing line. */
  pitIn?: Gate;
  pitOut?: Gate;
  /** The pit lane, as lines (minimaps, and whether a launch was in the pits). */
  pitLane?: LatLng[][];
  /** The start/finish line carried across the pit lane (timing loop): laps through the pits count. */
  startFinishPits?: Gate;
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
  /**
   * The lap went into the pits ('in'), came out of them ('out') or both: shown
   * and counted in the total, but never a best lap, sector or delta reference
   * (`valid` is false for them).
   */
  pit?: 'in' | 'out' | 'inout';
}

/** One visit to the pit lane. Times are device epoch ms. */
export interface PitStop {
  n: number;
  /** Crossed the pit-in line (or launched in the pit lane). */
  inT: number;
  /** Crossed the pit-out line. */
  outT: number;
  /** Pit lane time, in to out. */
  laneMs: number;
  /** Time stood still in the box (all stops), from GPS and the phone's motion. */
  stationaryMs: number;
  /** Each stop: when the bike came to rest, launched again, and began braking for it. */
  stopsAt: { from: number; to: number; brakeT?: number }[];
  /** m/s */
  maxSpeed: number;
  /** Time over the pit speed limit. */
  overLimitMs: number;
  /** The limit in force, m/s. */
  limit: number;
  /** The session started in the pit lane (out of the box). */
  fromStart?: boolean;
  /** The session ended before the rider left the pits. */
  unfinished?: boolean;
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
  /** Pit lane visits (tracks with a pit lane). */
  pitStops?: PitStop[];
  /** Pit lane speed limit used, m/s. */
  pitLimit?: number;
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
