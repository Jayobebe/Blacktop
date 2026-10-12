/**
 * Keeps GPS nonsense out of the live speed. This file imports nothing, so it
 * can be played through in Node.
 *
 * Two things were getting through, and a bicycle read 35 mph:
 *   - a phone that gives no speed of its own (most browsers on a bicycle's
 *     handlebars) had it worked out from one fix to the next, a second apart:
 *     a 15 m wobble in the position is 33 mph. Now it's measured over the last
 *     few seconds of fixes, and not at all while the position is too vague;
 *   - one wild reading went straight to the screen and into the top speed.
 *     Now a reading can only move as fast as the vehicle could (a bicycle
 *     doesn't gain 20 mph in a second), and the top speed needs two readings
 *     in a row to agree.
 */
export type SpeedVehicle = 'motorcycle' | 'car' | 'bicycle' | 'ebike' | 'escooter';

export interface SpeedLimits {
  /** mph gained per second, at most. */
  accel: number;
  /** mph lost per second, at most. */
  brake: number;
  /** A reading over this is thrown out. */
  top: number;
}

const MOTOR: SpeedLimits = { accel: 30, brake: 40, top: 200 };
const LIMITS: Record<SpeedVehicle, SpeedLimits> = {
  motorcycle: MOTOR,
  car: MOTOR,
  bicycle: { accel: 4, brake: 18, top: 65 },
  ebike: { accel: 6, brake: 18, top: 65 },
  escooter: { accel: 6, brake: 18, top: 50 },
};
export const speedLimitsFor = (vehicle: string | null | undefined): SpeedLimits => LIMITS[vehicle as SpeedVehicle] ?? MOTOR;

/** Position-worked speed is only trusted with the position this sharp (metres), and over this long (ms). */
const SHARP_M = 30;
const SPAN_MS = 2500;
const KEEP_MS = 6000;
const MPH = 2.2369;

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface SpeedFix {
  lat: number;
  lng: number;
  /** ms */
  t: number;
  /** The phone's own speed in mph, when it gives one. */
  deviceMph: number | null;
  /** metres, when known */
  accuracy: number | null;
}

export class SpeedFilter {
  private fixes: { lat: number; lng: number; t: number }[] = [];
  private mph = 0;
  private at: number | null = null;
  private shown = 0;
  /** Where the reading came from, for the GPS indicator. */
  source: 'device' | 'calculated' | 'none' = 'none';

  constructor(public limits: SpeedLimits) {}

  reset() {
    this.fixes = [];
    this.mph = 0;
    this.at = null;
    this.shown = 0;
    this.source = 'none';
  }

  /** The speed to believe after this fix, mph (not rounded). */
  next(fix: SpeedFix): number {
    this.fixes.push({ lat: fix.lat, lng: fix.lng, t: fix.t });
    while (this.fixes.length > 1 && fix.t - this.fixes[0].t > KEEP_MS) this.fixes.shift();

    let raw: number | null = null;
    if (fix.deviceMph != null && fix.deviceMph >= 0) {
      raw = fix.deviceMph;
      this.source = 'device';
    } else if (fix.accuracy == null || fix.accuracy <= SHARP_M) {
      // Over the longest stretch of recent fixes there is: a wobble of a few metres is little across three seconds.
      const from = this.fixes[0];
      const span = fix.t - from.t;
      if (span >= SPAN_MS) {
        raw = (metres(from, fix) / (span / 1000)) * MPH;
        this.source = 'calculated';
      }
    }
    const dt = this.at == null ? null : (fix.t - this.at) / 1000;
    this.at = fix.t;
    // Nothing to go on, or out of the question: keep what we had, easing off so a lost signal doesn't freeze a speed.
    if (raw == null || raw > this.limits.top) {
      if (raw == null) this.source = 'none';
      this.mph *= 0.85;
      return this.mph;
    }
    if (dt != null && dt > 0 && dt < 30) {
      // No vehicle changes speed faster than this, whatever one fix says.
      raw = Math.min(this.mph + this.limits.accel * dt, Math.max(this.mph - this.limits.brake * dt, raw));
    }
    this.mph = raw;
    return this.mph;
  }

  /**
   * For the top speed: the lower of this shown speed and the last one, so a
   * figure counts only once two readings running have reached it.
   */
  confirmed(shown: number): number {
    const both = Math.min(shown, this.shown);
    this.shown = shown;
    return both;
  }
}
