/**
 * When guidance asks for a new route (useTurnByTurn). Imports nothing, so `npm run reroute:check`
 * can play made-up rides through it. Four ways off the plan, each asked about once the router has
 * had a rest since the last new route:
 *
 *  - Off route: 45 m off the line for 4 s, as it always was (junction wobble is shorter), or
 *    90 m off on two fixes in a row (a second), clearly gone, without waiting the 4 s.
 *  - Missed turn: at or just past a turn the route takes (up to 60 m on) and 30 m off the line for
 *    2 s: gone straight on (or the wrong way) at the junction. Caught there, not 45 m down the wrong
 *    road. Only from the turn on: GPS lags and cuts corners on the way into one.
 *  - Wrong way: riding along the line against it (heading 135 degrees or more off the line's way)
 *    at 10 mph or more for 5 s: turned round, which the distance alone never sees, being on the line.
 *  - Before 2026-10-29 only the first existed (45 m for 4 s, whatever the case).
 *
 * The router is asked with the rider's heading (Prefs.bearing on the server), so the new route sets
 * off the way they're going instead of turning them round. Missed turns and wrong way may ask 8 s
 * after the last new route; anything else waits 12 s, as before (the public routers' limits).
 */
export type RerouteReason = 'off-route' | 'missed-turn' | 'wrong-way';

export interface RerouteSample {
  now: number;
  /** Metres from the rider to the line. */
  offset: number;
  /** Metres along the line to the rider's match. */
  along: number;
  /** Metres a second. */
  speed: number;
  /** The rider's heading (degrees from north), or null when not moving enough to have one. */
  heading: number | null;
  /** The line's heading at `along`. */
  lineBearing: number | null;
  /** Metres along the line to the nearest turn the route takes (a manoeuvre worth saying), if any. */
  nearestTurn: number | null;
}

export const OFF_ROUTE_M = 45;
const OFF_ROUTE_MS = 4000;
const FAR_OFF_M = 90;
/** Clearly off: two fixes in a row (a second apart) are enough. */
const QUICK_MS = 1000;
const TURN_WINDOW_M = 60;
const MISSED_TURN_M = 30;
const MISSED_MS = 2000;
const WRONG_WAY_DEG = 135;
const WRONG_WAY_MS = 5000;
const WRONG_WAY_SPEED = 4.5;
const GAP_MS = 12000;
const QUICK_GAP_MS = 8000;

const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export class RerouteWatch {
  private offSince: number | null = null;
  private farSince: number | null = null;
  private missSince: number | null = null;
  private wrongSince: number | null = null;
  private lastAt = -Infinity;

  /** The way off the plan this sample shows (and the time has come to ask), or null. */
  feed(s: RerouteSample): RerouteReason | null {
    const since = (cond: boolean, prev: number | null) => (cond ? prev ?? s.now : null);
    this.offSince = since(s.offset > OFF_ROUTE_M, this.offSince);
    this.farSince = since(s.offset > FAR_OFF_M, this.farSince);
    const atTurn = s.nearestTurn != null && s.along >= s.nearestTurn - 15 && s.along - s.nearestTurn < TURN_WINDOW_M;
    this.missSince = since(atTurn && s.offset > MISSED_TURN_M, this.missSince);
    const against =
      s.offset <= OFF_ROUTE_M && s.speed >= WRONG_WAY_SPEED && s.heading != null && s.lineBearing != null &&
      angleBetween(s.heading, s.lineBearing) >= WRONG_WAY_DEG;
    this.wrongSince = since(against, this.wrongSince);

    const held = (from: number | null, ms: number) => from != null && s.now - from >= ms;
    let reason: RerouteReason | null = null;
    if (held(this.missSince, MISSED_MS)) reason = 'missed-turn';
    else if (held(this.wrongSince, WRONG_WAY_MS)) reason = 'wrong-way';
    else if (held(this.farSince, QUICK_MS) || held(this.offSince, OFF_ROUTE_MS)) reason = 'off-route';
    if (!reason) return null;
    const gap = reason === 'off-route' ? GAP_MS : QUICK_GAP_MS;
    if (s.now - this.lastAt < gap) return null;
    this.lastAt = s.now;
    this.offSince = this.farSince = this.missSince = this.wrongSince = null;
    return reason;
  }

  /** A new route arrived: the clocks start again (the time since the last ask is kept). */
  newRoute() {
    this.offSince = this.farSince = this.missSince = this.wrongSince = null;
  }
}
