/**
 * Spectating an unlocked ride: what the leader's (or solo rider's) phone
 * sends, and on which channel. It's a Realtime broadcast on
 * `spectate:<convoy id>` (nothing stored): crew members who open the ride from
 * Crew Convoys join the channel's presence, and the rider's phone only sends
 * while somebody is there, every 2 s. Only rides listed in Crew Convoys send
 * at all, and the convoy id is only handed out by `list_crew_convoys` (crew
 * members). Peaks the rider keeps private (Public Road Privacy) go as null.
 * Speeds in mph and distance in miles, as the ride keeps them; the watcher's
 * phone shows them in its own units.
 */
export interface LiveRide {
  name: string;
  /** The rider's main vehicle ('motorcycle', 'car', …). */
  vehicle: string;
  lat: number;
  lng: number;
  /** Degrees from north while moving, else null. */
  heading: number | null;
  speed: number;
  maxSpeed: number | null;
  distance: number;
  /** Riding seconds. */
  duration: number;
  paused: boolean;
  /** Only when the rider's vehicle leans and they track it. */
  lean: number | null;
  maxLean: number | null;
  /** Live friction-circle G (lateral, longitudinal) when the rider runs the gauge. */
  g: { lat: number; lng: number } | null;
  maxG: number | null;
  destination: string | null;
  riders: number;
  /** When it was sent (ms). */
  at: number;
}

export const spectateChannelName = (convoyId: string) => `spectate:${convoyId}`;
export const LIVE_EVENT = 'live';
export const END_EVENT = 'end';
export const SEND_EVERY_MS = 2000;

/** What a spectator's phone puts in the channel's presence: who is watching. */
export interface SpectatorPresence {
  name: string;
}
