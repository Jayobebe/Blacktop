/**
 * Where to draw the rider between GPS fixes, frame by frame (imports nothing).
 *
 * Fixes come about once a second. Gliding from one to the next over the last
 * gap stalled or lurched whenever a fix came early or late, and the camera,
 * eased separately, stepped once a fix. This carries the rider on from the last
 * fix at its speed and heading (dead reckoning, at most `HORIZON_S` past it),
 * and when a new fix lands the difference between where the rider was drawn
 * and where the fix says is faded out over a moment instead of jumped (an
 * offset that decays), so the drawn position is always continuous and never
 * lags behind. Barely moving, the fade is slower, so GPS wander at a standstill
 * doesn't twitch the pin.
 */
export type LatLng = { lat: number; lng: number };

const HORIZON_S = 1.5;
const JUMP_M = 3000;
const M_PER_DEG = 111_320;
/** How far a fix pulls the reckoned position towards itself while moving. */
const PULL = 0.5;

export class RiderTrack {
  private fixAt = 0;
  private base: LatLng | null = null;
  /** Velocity in metres a second, east and north. */
  private vE = 0;
  private vN = 0;
  /** Drawn minus predicted, in metres east / north: faded to nothing. */
  private oE = 0;
  private oN = 0;
  private lastStep = 0;

  /** The rider's speed now (m/s), from the fixes. */
  get speed() {
    return Math.hypot(this.vE, this.vN);
  }

  /** The way the rider is going (degrees from north), or null when barely moving. */
  get heading(): number | null {
    return this.speed > 2 ? ((Math.atan2(this.vE, this.vN) * 180) / Math.PI + 360) % 360 : null;
  }

  get hasFix() {
    return !!this.base;
  }

  /** The last fix itself (Thermal mode and reduced motion draw only that). */
  get latest(): LatLng | null {
    return this.base;
  }

  /** A new fix. `speed` (m/s) and `heading` (degrees) from the phone when it has them. */
  fix(lat: number, lng: number, at: number, speed: number | null, heading: number | null) {
    const drawn = this.base ? this.position(at) : null;
    const prev = this.base;
    const prevAt = this.fixAt;
    // On the move, a fix only pulls where the rider is reckoned to be halfway towards it: a fix's few
    // metres of noise are halved, and a real change of line is caught up within a couple of fixes.
    let base = { lat, lng };
    if (prev && this.speed > 1 && at - prevAt < HORIZON_S * 1000) {
      const t = (at - prevAt) / 1000;
      const expected = offsetBy(prev, this.vE * t, this.vN * t);
      const [dE, dN] = metresBetween(expected, base);
      if (Math.hypot(dE, dN) < 30) base = offsetBy(expected, dE * PULL, dN * PULL);
    }
    this.base = base;
    this.fixAt = at;
    let vE = 0;
    let vN = 0;
    if (speed != null && Number.isFinite(speed) && speed > 0.5 && heading != null && Number.isFinite(heading)) {
      const r = (heading * Math.PI) / 180;
      vE = speed * Math.sin(r);
      vN = speed * Math.cos(r);
    } else if (prev && at - prevAt > 200 && at - prevAt < 5000) {
      const dt = (at - prevAt) / 1000;
      const [dE, dN] = metresBetween(prev, { lat, lng });
      vE = dE / dt;
      vN = dN / dt;
      if (Math.hypot(vE, vN) < 0.8) vE = vN = 0; // wander at a standstill isn't movement
    }
    // A little smoothing, so one wild fix can't swing the prediction.
    this.vE = prev ? this.vE * 0.35 + vE * 0.65 : vE;
    this.vN = prev ? this.vN * 0.35 + vN * 0.65 : vN;
    if (!drawn) {
      this.oE = this.oN = 0;
      return;
    }
    const [oE, oN] = metresBetween(this.base, drawn);
    if (Math.hypot(oE, oN) > JUMP_M) {
      this.oE = this.oN = 0; // a lost signal coming back: just go there
    } else {
      this.oE = oE;
      this.oN = oN;
    }
  }

  /** Where to draw the rider at `now` (no fading: read-only). */
  position(now: number): LatLng {
    const t = Math.min(HORIZON_S, Math.max(0, (now - this.fixAt) / 1000));
    return offsetBy(this.base!, this.vE * t + this.oE, this.vN * t + this.oN);
  }

  /** Advance to `now` (fading the correction) and say where to draw the rider. */
  step(now: number): LatLng {
    const dt = this.lastStep ? Math.min(0.1, Math.max(0, (now - this.lastStep) / 1000)) : 0;
    this.lastStep = now;
    // Long enough that a fix's few metres of GPS noise read as a glide, not a surge; slower still barely moving.
    const tau = this.speed > 1 ? 0.8 : 1.2;
    const k = Math.exp(-dt / tau);
    this.oE *= k;
    this.oN *= k;
    return this.position(now);
  }

  /** Nothing left to draw differently at `now`: not moving (or past the horizon with no fix) and the correction faded. */
  settled(now: number) {
    return (this.speed < 0.3 || now - this.fixAt > HORIZON_S * 1000) && Math.hypot(this.oE, this.oN) < 0.2;
  }
}

function metresBetween(a: LatLng, b: LatLng): [number, number] {
  const e = (b.lng - a.lng) * M_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const n = (b.lat - a.lat) * M_PER_DEG;
  return [e, n];
}

function offsetBy(p: LatLng, e: number, n: number): LatLng {
  return { lat: p.lat + n / M_PER_DEG, lng: p.lng + e / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)) };
}
