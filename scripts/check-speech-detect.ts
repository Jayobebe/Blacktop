/**
 * npm run speech:check: plays made-up sound through the voice chat's speech
 * detector (src/features/voice/lib/speechDetector.ts) the way the phone does,
 * a 2,048-point spectrum every 100 ms, and fails if wind, an engine, hiss or a
 * gust ever count as talking, or if speech over them isn't heard quickly and let
 * go of soon after.
 */
import { SpeechDetector } from '../src/features/voice/lib/speechDetector';

const SR = 48000;
const FFT = 2048; // the hook's analyser fftSize
const FRAME = SR / 10; // a frame every 100 ms
const SMOOTH = 0.2; // the analyser's smoothingTimeConstant in the hook

let seed = 12345;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

type Gen = (t: number) => number;

/** Wind: low-heavy (integrated) noise with slow gusts. */
function wind(level: number, gustHz = 0.3, gustDb = 6): Gen {
  let b = 0;
  return (t) => {
    b = 0.985 * b + 0.15 * gauss();
    const gust = Math.pow(10, (gustDb * Math.sin(2 * Math.PI * gustHz * t)) / 20);
    return level * gust * b;
  };
}
/** Hiss: white noise. */
const hiss = (level: number): Gen => () => level * gauss();
/** Engine: harmonics of a firing frequency, 1/n, plus a little roughness; f0 may follow a curve. */
function engine(level: number | ((t: number) => number), f0: (t: number) => number): Gen {
  let phase = 0;
  return (t) => {
    phase += (2 * Math.PI * f0(t)) / SR;
    let s = 0;
    for (let n = 1; n <= 40; n++) s += Math.sin(n * phase) / n;
    return (typeof level === 'number' ? level : level(t)) * (s + 0.2 * gauss());
  };
}
/** Speech: a voice (110–140 Hz with formants at 500 / 1,500 / 2,500 Hz) in syllables, 4 a second, with gaps. */
function speech(level: number, from: number, to: number): Gen {
  let phase = 0;
  return (t) => {
    if (t < from || t > to) return 0;
    const f0 = 120 + 15 * Math.sin(2 * Math.PI * 0.7 * t);
    phase += (2 * Math.PI * f0) / SR;
    const syl = (t * 4) % 1;
    const env = syl < 0.65 ? Math.sin((Math.PI * syl) / 0.65) : 0; // the gap between syllables
    const pause = Math.floor(t * 4) % 7 === 6 ? 0 : 1; // a breath now and then
    let s = 0;
    for (let n = 1; n * f0 < 4000; n++) {
      const f = n * f0;
      const formant = Math.exp(-(((f - 500) / 180) ** 2)) + 0.6 * Math.exp(-(((f - 1500) / 250) ** 2)) + 0.35 * Math.exp(-(((f - 2500) / 300) ** 2));
      s += (formant + 0.02) * Math.sin(n * phase);
    }
    return level * env * pause * s;
  };
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

/** Runs `seconds` of the sum of `gens`; returns whether it counted as talking at each 100 ms. */
let dbgName = "";
function run(seconds: number, gens: Gen[]): boolean[] {
  seed = 12345;
  const total = Math.round(seconds * SR);
  const buf = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let v = 0;
    for (const g of gens) v += g(t);
    buf[i] = v;
  }
  const det = new SpeechDetector({ sampleRate: SR, fftSize: FFT });
  const smooth = new Float64Array(FFT / 2);
  const out: boolean[] = [];
  for (let end = FFT; end <= total; end += FRAME) {
    const re = new Float64Array(FFT), im = new Float64Array(FFT);
    for (let i = 0; i < FFT; i++) {
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / FFT) + 0.08 * Math.cos((4 * Math.PI * i) / FFT); // Blackman, as the analyser uses
      re[i] = buf[end - FFT + i] * w;
    }
    fft(re, im);
    const db = new Float32Array(FFT / 2);
    for (let k = 0; k < FFT / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) / FFT;
      smooth[k] = SMOOTH * smooth[k] + (1 - SMOOTH) * mag;
      db[k] = 20 * Math.log10(smooth[k] + 1e-12);
    }
    out.push(det.push(db));
    if (process.env.DEBUG === dbgName) { const l = det.last; console.log((end/SR).toFixed(1), l.level.toFixed(1), l.floor.toFixed(1), l.share.toFixed(2), l.pitch.toFixed(2), l.swing.toFixed(1), l.voiced ? "V" : "", det.speaking ? "S" : ""); }
  }
  return out;
}

let failed = 0;
const frameAt = (t: number) => Math.round((t * SR - FFT) / FRAME);
function never(name: string, seconds: number, gens: Gen[]) {
  dbgName = name;
  const r = run(seconds, gens);
  const hits = r.filter(Boolean).length;
  const ok = hits === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: talking in ${hits} of ${r.length} frames`);
}
function talks(name: string, seconds: number, from: number, to: number, gens: Gen[]) {
  dbgName = name;
  const r = run(seconds, gens);
  const first = r.findIndex((v, i) => v && i >= frameAt(from) - 1);
  const onset = first < 0 ? Infinity : first * 0.1 + FFT / SR - from;
  let last = -1;
  r.forEach((v, i) => { if (v) last = i; });
  const release = last * 0.1 + FFT / SR - to;
  const before = r.slice(0, Math.max(0, frameAt(from) - 1)).filter(Boolean).length;
  const during = r.slice(frameAt(from + 0.8), frameAt(to)).filter((v) => !v).length;
  const ok = onset <= 0.8 && release <= 1.5 && before === 0 && during <= 3;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: heard after ${onset === Infinity ? 'never' : onset.toFixed(1) + ' s'}, let go ${release.toFixed(1)} s after, ${before} false before, ${during} dropouts while talking`,
  );
}


const steady = (f: number) => () => f;

never('Quiet room', 10, [hiss(0.001)]);
never('Wind at speed, gusting', 20, [wind(0.2), hiss(0.003)]);
never('Strong gusts', 20, [wind(0.3, 0.8, 10), hiss(0.003)]);
never('Road hiss', 15, [hiss(0.05)]);
never('Engine cruising', 20, [engine(0.05, steady(70)), wind(0.1)]);
never('Engine revving through the gears', 20, [engine(0.05, (t) => 50 + 40 * ((t % 4) / 4)), wind(0.1)]);
never('Engine blipped at a standstill', 15, [engine(0.03, (t) => (t % 3 < 0.6 ? 120 : 40)), hiss(0.002)]);
// Engines whose firing note sits inside a voice's pitch range, and revs that get louder as they climb.
never("Engine cruising at a voice's pitch", 20, [engine(0.05, steady(140)), wind(0.1)]);
never("Engine revving up loud through a voice's pitches", 20, [engine((t) => 0.05 * (1 + 2 * ((t % 4) / 4)), (t) => 90 + 120 * ((t % 4) / 4)), wind(0.1)]);
never('Single-cylinder thump', 20, [engine(0.06, steady(45)), wind(0.12)]);
talks('Talking in a quiet room', 12, 3, 8, [hiss(0.001), speech(0.05, 3, 8)]);
// A voice is checked from 3 dB over the noise in its own band (a helmet mic, after the phone's noise
// suppression): quieter than the wind, nobody could follow it anyway.
talks('Talking over wind, 3 dB above it', 15, 4, 10, [wind(0.2), hiss(0.003), speech(0.24, 4, 10)]);
talks('Talking over an engine', 15, 4, 10, [engine(0.05, steady(70)), wind(0.1), speech(0.15, 4, 10)]);
talks('Talking over strong gusts, 3 dB above them', 15, 4, 10, [wind(0.3, 0.8, 10), hiss(0.003), speech(0.45, 4, 10)]);

if (failed) {
  console.error(`${failed} speech check(s) failed`);
  process.exit(1);
}
console.log('Speech detection checks passed.');
