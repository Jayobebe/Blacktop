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
 *
 * Every rider in the convoy sends their own ride too, so a spectator can move
 * from rider to rider: the leader on `LIVE_EVENT` as always (an older
 * spectator app hears only that, and follows the leader as it did), everyone
 * else on `RIDER_EVENT`. A spectator says in its presence who it's following;
 * that rider's phone sends every 2 s, the rest only every 6 s, enough to keep
 * their pins moving.
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
  /** Who sent it (their account id), to tell riders apart. */
  rider?: string;
  /** Their accent (an accent id from Settings), for their pin. */
  color?: string;
}

export const spectateChannelName = (convoyId: string) => `spectate:${convoyId}`;
export const LIVE_EVENT = 'live';
export const END_EVENT = 'end';
export const RIDER_EVENT = 'rider';
export const SEND_EVERY_MS = 2000;
/** A rider no spectator is following sends this often: just their pin. */
export const SLOW_EVERY_MS = 6000;

/** What a spectator's phone puts in the channel's presence: who is watching. */
export interface SpectatorPresence {
  name: string;
  /** The rider being followed (account id); none (an older app) means the leader. */
  following?: string;
}
