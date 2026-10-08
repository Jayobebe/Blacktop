/**
 * Vehicle-frame G-force for the friction-circle meter: cornering (lateral) and
 * braking / acceleration (longitudinal) in g, with gravity removed, plus the
 * peak envelope in every direction.
 *
 * Axes come from the phone: "up" is gravity (a slow average of the raw
 * accelerometer), "right" is the screen's right edge flattened onto the
 * horizontal, and "forward" is up × right, i.e. away from the rider for a
 * phone facing them. Works in any mount angle and screen orientation.
 *
 * Bikes lean into corners, so a phone on one barely feels sideways force. For
 * them cornering G is what the bike is really doing: its speed times how fast
 * it's turning about the vertical (the gyro), which is the sideways
 * acceleration of any turn. Lean only says which way. It used to be tan(lean)
 * on its own, which made the dot a copy of the lean bar: a bike leant on its
 * stand, or a phone tilted in the hand, "cornered" at a standstill. That
 * estimate is still the fallback where there's no gyro or no speed, but fades
 * out below walking pace.
 *
 * Sign convention (what the meter plots): +lateral = turning right,
 * +longitudinal = braking. So the dot goes right in a right-hander and up
 * under braking.
 */

export const G = 9.80665;
/** Envelope resolution: one bin per 5° of direction. */
export const ENVELOPE_BINS = 72;

type Vec = [number, number, number];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec | null => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

/** The screen's right edge in device axes, for screen.orientation.angle. */
export function screenRightAxis(angle: number): Vec {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return [0, -1, 0]; // landscape, top of the phone to the left
    case 180:
      return [-1, 0, 0];
    case 270:
      return [0, 1, 0]; // landscape, top of the phone to the right
    default:
      return [1, 0, 0];
  }
}

export interface GMax {
  left: number;
  right: number;
  brake: number;
  accel: number;
}

export interface GVectorState {
  /** Smoothed cornering G (+ right). */
  lateral: number;
  /** Smoothed longitudinal G (+ braking). */
  longitudinal: number;
  /** Peak G per direction, ENVELOPE_BINS bins starting at "braking" going clockwise. */
  envelope: number[];
  max: GMax;
}

export function emptyGVector(): GVectorState {
  return { lateral: 0, longitudinal: 0, envelope: new Array(ENVELOPE_BINS).fill(0), max: { left: 0, right: 0, brake: 0, accel: 0 } };
}

/** Bin index for a direction on the meter (0 = straight up = braking, clockwise). */
export function envelopeBin(lateral: number, longitudinal: number): number {
  const theta = Math.atan2(lateral, longitudinal); // 0 = braking, +90° = right
  const turn = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
  return Math.round(turn * ENVELOPE_BINS) % ENVELOPE_BINS;
}

/** Ignore anything smaller than this for peaks, so engine buzz doesn't trace a ring. */
const NOISE_G = 0.08;
/** Gravity (the "up" axis) from a slow average of the raw reading, when the OS gives no linear acceleration. */
const GRAVITY_TAU_S = 2;
/** Gravity from incl − linear (OS sensor fusion): only smoothed against jitter. */
const GRAVITY_TAU_FUSED_S = 0.3;
/** Smoothing of the plotted values: road and engine vibration otherwise dominate. */
const SMOOTH_TAU_S = 0.25;
/** Beyond this lean the tan() estimate runs away (and it's likely a fall, not a turn). */
const MAX_LEAN_DEG = 65;
/** No cornering below this speed (m/s): nothing is turning hard at a crawl, and GPS speed is noise there. */
const MIN_CORNER_SPEED = 2;
/** More than any road tyre holds: a spike past it is the phone being knocked, not the bike. */
const MAX_CORNER_G = 1.8;

/**
 * Stateful tracker: feed it every devicemotion sample. Keeps its own gravity
 * estimate and smoothing, and accumulates the envelope and maxima.
 */
export class GVectorTracker {
  private gravity: Vec | null = null;
  private lastT = 0;
  /** Which way the last real lean was (+1 right): a turn's direction when the bike is almost upright. */
  private side = 1;
  state: GVectorState = emptyGVector();

  reset() {
    this.gravity = null;
    this.lastT = 0;
    this.side = 1;
    this.state = emptyGVector();
  }

  /**
   * @param incl accelerationIncludingGravity (m/s²)
   * @param linear acceleration without gravity from the OS, if available (m/s²)
   * @param screenAngle screen.orientation.angle
   * @param leanDeg current lean (+ right), for vehicles that lean; null otherwise
   * @param t timestamp in ms
   * @param rot rotation rate about the device's x, y, z in rad/s (the gyro), if there is one
   * @param speedMs ground speed in m/s, if known
   */
  update(incl: Vec, linear: Vec | null, screenAngle: number, leanDeg: number | null, t: number, rot: Vec | null = null, speedMs: number | null = null) {
    const dt = this.lastT ? Math.min(0.2, Math.max(0.001, (t - this.lastT) / 1000)) : 0.016;
    this.lastT = t;

    // With the OS's gravity-free reading, gravity is exactly incl − linear (the OS
    // fuses the gyro), so it doesn't drift during a long brake or corner; only
    // lightly smoothed. Without it, fall back to a slow average of the raw reading.
    const gSample: Vec = linear ? [incl[0] - linear[0], incl[1] - linear[1], incl[2] - linear[2]] : incl;
    const tau = linear ? GRAVITY_TAU_FUSED_S : GRAVITY_TAU_S;
    if (!this.gravity) this.gravity = [...gSample];
    else {
      const k = 1 - Math.exp(-dt / tau);
      for (let i = 0; i < 3; i++) this.gravity[i] += (gSample[i] - this.gravity[i]) * k;
    }
    const up = norm(this.gravity);
    if (!up) return this.state;

    const lin: Vec = linear ?? [incl[0] - this.gravity[0], incl[1] - this.gravity[1], incl[2] - this.gravity[2]];
    const r = screenRightAxis(screenAngle);
    const right = norm([r[0] - dot(r, up) * up[0], r[1] - dot(r, up) * up[1], r[2] - dot(r, up) * up[2]]);
    if (!right) return this.state;
    const forward = cross(up, right);

    const rawLong = -dot(lin, forward) / G; // + braking
    let rawLat: number;
    if (leanDeg !== null && Number.isFinite(leanDeg)) {
      const lean = Math.max(-MAX_LEAN_DEG, Math.min(MAX_LEAN_DEG, leanDeg));
      if (Math.abs(lean) > 1.5) this.side = Math.sign(lean);
      if (rot && speedMs !== null) {
        // Speed × turn rate about the vertical. Only its size is read from the gyro (phones disagree on which way
        // "up" is signed); the bike leans into the turn, so lean gives the side. Without the OS's fused gravity the
        // vertical drifts towards the bike's own axis in a long corner, which reads the turn low by cos(lean).
        const yaw = Math.abs(dot(rot, up)) / (linear ? 1 : Math.max(0.5, Math.cos((lean * Math.PI) / 180)));
        rawLat = speedMs < MIN_CORNER_SPEED ? 0 : this.side * Math.min(MAX_CORNER_G, (speedMs * yaw) / G);
      } else {
        const moving = speedMs === null ? 1 : Math.max(0, Math.min(1, (speedMs - 1) / 4));
        rawLat = Math.tan((lean * Math.PI) / 180) * moving;
      }
    } else rawLat = dot(lin, right) / G;

    const s = this.state;
    const k = 1 - Math.exp(-dt / SMOOTH_TAU_S);
    s.lateral += (rawLat - s.lateral) * k;
    s.longitudinal += (rawLong - s.longitudinal) * k;

    const mag = Math.hypot(s.lateral, s.longitudinal);
    if (mag >= NOISE_G) {
      const bin = envelopeBin(s.lateral, s.longitudinal);
      if (mag > s.envelope[bin]) s.envelope[bin] = mag;
    }
    if (s.lateral > s.max.right) s.max.right = s.lateral;
    if (-s.lateral > s.max.left) s.max.left = -s.lateral;
    if (s.longitudinal > s.max.brake) s.max.brake = s.longitudinal;
    if (-s.longitudinal > s.max.accel) s.max.accel = -s.longitudinal;
    return s;
  }
}

/** Merge two envelopes / maxima (e.g. a restored ride continuing). */
export function mergeGVector(a: Pick<GVectorState, 'envelope' | 'max'>, b: Pick<GVectorState, 'envelope' | 'max'>) {
  return {
    envelope: a.envelope.map((v, i) => Math.max(v, b.envelope[i] ?? 0)),
    max: {
      left: Math.max(a.max.left, b.max.left),
      right: Math.max(a.max.right, b.max.right),
      brake: Math.max(a.max.brake, b.max.brake),
      accel: Math.max(a.max.accel, b.max.accel),
    },
  };
}
