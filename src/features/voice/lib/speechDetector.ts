/**
 * Is someone actually talking into this mic, or is it the wind, the engine or
 * road noise? The voice chat used to call anything louder than 2 % "speaking",
 * which at speed is all the time. This reads the spectrum the mic's analyser
 * gives every frame (dB per bin, as `getFloatFrequencyData` returns it) and
 * asks four things a voice has and noise mostly doesn't:
 *
 * - loud in the speech band (300 to 3,400 Hz) compared with what that band
 *   usually sits at here (a floor that follows the noise as it rises and falls:
 *   wind at 70 mph is the new quiet);
 * - most of its energy in that band, not in the rumble under it (wind, engine)
 *   or the hiss above it;
 * - pitched: a comb of harmonics of one note between 80 and 300 Hz, loud on
 *   the teeth and quiet between them, which wind, hiss and road roar never are;
 * - coming and going a few times a second (syllables), where an engine at a
 *   steady speed holds one level.
 *
 * A few voiced frames in a row start it; most of a second without one ends it.
 * Imports nothing, so `npm run speech:check` plays made-up wind, engines, hiss
 * and speech through it in Node.
 */

export interface SpeechDetectorOptions {
  sampleRate: number;
  fftSize: number;
}

const SPEECH_LO = 300;
const SPEECH_HI = 3400;
const ALL_LO = 60;
const ALL_HI = 8000;
/** dB the speech band must stand above its floor. */
const ABOVE_FLOOR = 4;
/** Share of the energy that must be in the speech band. */
const SPEECH_SHARE = 0.35;
/** dB a voice's harmonics must stand above the gaps between them. */
const MIN_PITCH = 5.5;
const PITCH_LO = 80;
const PITCH_HI = 300;
/** Frames (of ~100 ms) looked back over to start, and voiced ones needed. */
const START_WINDOW = 4;
const START_VOICED = 2;
/** Frames without a voiced one before it counts as stopped. */
const HANGOVER = 8;
/** Syllables: the speech band's level must swing by this much (dB, std) over the last second. */
const MIN_SWING = 2.5;
const SWING_WINDOW = 10;
/** How fast the floor climbs back up after it was pulled down (dB a frame). */
const FLOOR_RISE = 0.3;

export class SpeechDetector {
  private readonly bins: { speech: [number, number]; all: [number, number]; pitch: [number, number] };
  private readonly power: Float64Array;
  private readonly hz: number;
  private floor: number | null = null;
  private recent: boolean[] = [];
  private levels: number[] = [];
  private quiet = 0;
  speaking = false;
  /** The last frame's readings, for checks and tuning. */
  last = { level: 0, floor: 0, share: 0, flatness: 1, pitch: 0, swing: 0, voiced: false };

  constructor({ sampleRate, fftSize }: SpeechDetectorOptions) {
    const hz = sampleRate / fftSize;
    const bin = (f: number) => Math.max(1, Math.min(fftSize / 2 - 1, Math.round(f / hz)));
    this.bins = { speech: [bin(SPEECH_LO), bin(SPEECH_HI)], all: [bin(ALL_LO), bin(ALL_HI)], pitch: [bin(200), bin(2000)] };
    this.power = new Float64Array(fftSize / 2);
    this.hz = hz;
  }

  /**
   * One frame of the analyser's spectrum in dB (`getFloatFrequencyData`).
   * Returns whether someone is talking now.
   */
  push(db: Float32Array | number[]): boolean {
    const [s0, s1] = this.bins.speech;
    const [a0, a1] = this.bins.all;
    let all = 0;
    let speech = 0;
    let logSum = 0;
    let n = 0;
    const power = this.power;
    for (let i = 0; i < power.length; i++) {
      const v = db[i];
      power[i] = Number.isFinite(v) ? Math.pow(10, v / 10) : 0;
    }
    for (let i = a0; i <= a1; i++) {
      const p = power[i];
      all += p;
      if (i >= s0 && i <= s1) {
        speech += p;
        logSum += Math.log(p + 1e-12);
        n++;
      }
    }
    const level = 10 * Math.log10(speech + 1e-12);
    const share = all > 0 ? speech / all : 0;
    const flatness = n && speech > 0 ? Math.exp(logSum / n) / (speech / n) : 1;
    const pitch = this.pitchStrength(power);

    // The floor drops straight to anything quieter and creeps up to anything louder.
    if (this.floor === null || level < this.floor) this.floor = level;
    else this.floor = Math.min(level, this.floor + FLOOR_RISE);

    this.levels.push(level);
    if (this.levels.length > SWING_WINDOW) this.levels.shift();
    const mean = this.levels.reduce((a, b) => a + b, 0) / this.levels.length;
    const swing = Math.sqrt(this.levels.reduce((a, b) => a + (b - mean) * (b - mean), 0) / this.levels.length);

    const voiced = level > this.floor + ABOVE_FLOOR && share >= SPEECH_SHARE && pitch >= MIN_PITCH;
    this.last = { level, floor: this.floor, share, flatness, pitch, swing, voiced };
    this.recent.push(voiced);
    if (this.recent.length > START_WINDOW) this.recent.shift();

    if (voiced) this.quiet = 0;
    else this.quiet++;

    if (!this.speaking) {
      const count = this.recent.filter(Boolean).length;
      if (count >= START_VOICED && swing >= MIN_SWING) this.speaking = true;
    } else if (this.quiet >= HANGOVER) {
      this.speaking = false;
    }
    return this.speaking;
  }

  /**
   * How much a voice's pitch stands out, in dB: for every pitch from 80 to
   * 300 Hz, the power on its harmonics between 200 and 3,000 Hz against the
   * power half-way between them (both sides), best pitch kept. A voice is a comb of
   * harmonics, so the two differ by several dB; wind, hiss and road roar are
   * as loud between as on, so they read about 0.
   */
  private pitchStrength(power: Float64Array): number {
    const at = (f: number) => {
      const x = f / this.hz;
      const i = Math.floor(x);
      if (i < 1 || i + 1 >= power.length) return 0;
      return power[i] + (power[i + 1] - power[i]) * (x - i);
    };
    let best = 0;
    for (let f0 = PITCH_LO; f0 <= PITCH_HI; f0 += 2) {
      let on = 0;
      let off = 0;
      for (let k = Math.ceil(200 / f0); k * f0 <= 3000; k++) {
        on += at(k * f0);
        // Both sides, so a spectrum that falls with frequency (wind does, steeply) doesn't read as a comb.
        off += (at((k - 0.5) * f0) + at((k + 0.5) * f0)) / 2;
      }
      if (on > 0 && off > 0) {
        const db = 10 * Math.log10(on / off);
        if (db > best) best = db;
      }
    }
    return best;
  }

  reset() {
    this.floor = null;
    this.recent = [];
    this.levels = [];
    this.quiet = 0;
    this.speaking = false;
  }
}
