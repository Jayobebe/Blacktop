/**
 * Decides when a parked vehicle is being tampered with, from the phone's tilt
 * (orientation, both axes) and G (total acceleration, ~1 G at rest).
 *
 * With discretion: a tilt has to hold for a moment (a gust or a knock doesn't
 * count), a jolt has to last two sample windows, and small disturbances only
 * earn a warning chirp. A big tilt (off the stand, pushed away, lifted) or a
 * hard jolt trips it straight away; so do three small ones inside 30 s.
 */
export type AlarmSensitivity = 'low' | 'normal' | 'high';

const LEVELS: Record<AlarmSensitivity, { nudgeTilt: number; tripTilt: number; nudgeG: number; tripG: number }> = {
  high: { nudgeTilt: 2.5, tripTilt: 7, nudgeG: 0.1, tripG: 0.35 },
  normal: { nudgeTilt: 4, tripTilt: 11, nudgeG: 0.18, tripG: 0.55 },
  low: { nudgeTilt: 7, tripTilt: 18, nudgeG: 0.3, tripG: 0.9 },
};

const SUSTAIN_MS = 350;
const NUDGE_GAP_MS = 3500;
const NUDGE_WINDOW_MS = 30_000;
const NUDGES_TO_TRIP = 3;

export interface TamperEvent {
  kind: 'nudge' | 'trip';
  cause: 'tilt' | 'impact';
}

/** Smallest difference between two angles, in degrees. */
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
};

export class TamperDetector {
  private base: { beta: number; gamma: number } | null = null;
  private resting: { beta: number; gamma: number }[] = [];
  private tiltSince: { level: 'nudge' | 'trip'; at: number } | null = null;
  private gHits = 0;
  private gTripHits = 0;
  private lastNudge = -Infinity;
  private nudges: number[] = [];

  constructor(private sensitivity: AlarmSensitivity) {}

  /** During the exit delay: learn the resting position (median of the last second or so). */
  settle(beta: number, gamma: number) {
    this.resting.push({ beta, gamma });
    if (this.resting.length > 24) this.resting.shift();
    this.base = { beta: median(this.resting.map((r) => r.beta)), gamma: median(this.resting.map((r) => r.gamma)) };
  }

  orientation(beta: number, gamma: number, now: number): TamperEvent | null {
    if (!this.base) {
      this.base = { beta, gamma };
      return null;
    }
    const L = LEVELS[this.sensitivity];
    const tilt = Math.max(angleDiff(beta, this.base.beta), Math.abs(gamma - this.base.gamma));
    const level = tilt >= L.tripTilt ? 'trip' : tilt >= L.nudgeTilt ? 'nudge' : null;
    if (!level) {
      this.tiltSince = null;
      return null;
    }
    if (!this.tiltSince || (level === 'trip' && this.tiltSince.level !== 'trip')) this.tiltSince = { level, at: now };
    if (now - this.tiltSince.at < SUSTAIN_MS) return null;
    if (level === 'trip') return { kind: 'trip', cause: 'tilt' };
    return this.nudge(now, 'tilt');
  }

  /** `g`: the peak total acceleration of a ~50 ms window, in G. */
  motion(g: number, now: number): TamperEvent | null {
    const L = LEVELS[this.sensitivity];
    const dev = Math.abs(g - 1);
    this.gTripHits = dev >= L.tripG ? this.gTripHits + 1 : 0;
    this.gHits = dev >= L.nudgeG ? this.gHits + 1 : 0;
    if (this.gTripHits >= 2) return { kind: 'trip', cause: 'impact' };
    if (this.gHits >= 2) return this.nudge(now, 'impact');
    return null;
  }

  private nudge(now: number, cause: TamperEvent['cause']): TamperEvent | null {
    if (now - this.lastNudge < NUDGE_GAP_MS) return null;
    this.lastNudge = now;
    this.nudges = this.nudges.filter((at) => now - at < NUDGE_WINDOW_MS);
    this.nudges.push(now);
    if (this.nudges.length >= NUDGES_TO_TRIP) return { kind: 'trip', cause };
    return { kind: 'nudge', cause };
  }
}
