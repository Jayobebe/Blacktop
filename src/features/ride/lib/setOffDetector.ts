import { SpeedFilter, speedLimitsFor, type SpeedFix } from './speedFilter';

/**
 * Has the rider set off? The reasoning behind Home's "On the move?" card, with
 * no React, clock or GPS of its own (it only imports the speed filter), so
 * made-up fixes can be played through it in Node.
 *
 * Two stages, so the GPS chip is only woken when there's a reason to:
 *   - `coarseMoved`: two rough fixes (network location, cheap) far enough
 *     apart, for long enough, that it can't be the position wobbling;
 *   - `SetOffDetector`: real GPS through the ride's speed filter, and the
 *     speed has to hold. One fast reading is never enough.
 */

const MPH = 2.2369;

export interface SetOffRule {
  /** mph the speed has to stay at or over... */
  mph: number;
  /** ...for this long (ms). */
  holdMs: number;
}

/** A motor vehicle is clear of walking and running by 10 mph; a bicycle has to be caught lower, so it must hold longer. */
export const setOffRuleFor = (motorised: boolean): SetOffRule =>
  motorised ? { mph: 10, holdMs: 8000 } : { mph: 7, holdMs: 12000 };

export interface CoarseFix {
  lat: number;
  lng: number;
  /** ms */
  t: number;
  /** metres */
  accuracy: number;
  /** The phone's own speed, m/s, when it gives one. */
  speed: number | null;
}

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371000;
};

/**
 * A rough fix older than this is replaced as the place to measure from (ms).
 * A minute: long enough for a bicycle to get 150 m clear of it, short enough
 * that standing about beforehand doesn't water the pace down.
 */
export const ANCHOR_MAX_MS = 60000;

/** Worth waking the GPS for: `now` is clearly somewhere else than `anchor`, at a vehicle's pace. */
export function coarseMoved(anchor: CoarseFix | null, now: CoarseFix, rule: SetOffRule): boolean {
  if (now.speed != null && now.accuracy <= 100 && now.speed * MPH >= rule.mph) return true;
  if (!anchor) return false;
  const span = (now.t - anchor.t) / 1000;
  if (span < 10 || span * 1000 > ANCHOR_MAX_MS) return false;
  const moved = metres(anchor, now);
  // Further than both fixes could be wrong by put together, and never less than 150 m.
  if (moved < Math.max(150, anchor.accuracy + now.accuracy)) return false;
  return (moved / span) * MPH >= rule.mph;
}

/** GPS vaguer than this says nothing about speed (metres). */
const SHARP_M = 50;

export class SetOffDetector {
  private filter: SpeedFilter;
  private since: number | null = null;

  constructor(private rule: SetOffRule, motorised: boolean) {
    this.filter = new SpeedFilter(speedLimitsFor(motorised ? 'motorcycle' : 'bicycle'));
  }

  /** True once the speed has held for the rule's time. */
  next(fix: SpeedFix): boolean {
    if (fix.accuracy != null && fix.accuracy > SHARP_M) {
      this.since = null;
      return false;
    }
    const mph = this.filter.next(fix);
    if (mph < this.rule.mph) {
      this.since = null;
      return false;
    }
    if (this.since == null) this.since = fix.t;
    return fix.t - this.since >= this.rule.holdMs;
  }
}
