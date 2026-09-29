/**
 * Fighter-pilot radio sound for everything the app says or beeps (not music,
 * and not the standard turn-by-turn voice): squelch key-up and release, a
 * faint static bed under spoken prompts, and cockpit-style warning tones.
 * All made with Web Audio on the fly (no sound files) and sent through one
 * "radio" chain: band-passed to a comms band, lightly saturated, compressed.
 *
 * Battery: the AudioContext is only running while a sound plays. It's created
 * and unlocked on the first tap (iOS only lets audio start from a gesture),
 * then suspended, and each sound resumes it and lets it suspend again shortly
 * after the last one ends.
 */

let ctx: AudioContext | null = null;
let chain: AudioNode | null = null;
let active = 0;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_SUSPEND_MS = 1500;

function create(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Comms band, a touch of grit, then a compressor so everything sits at one level.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.2 * x);
    }
    drive.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 6;
    hp.connect(lp).connect(drive).connect(comp).connect(ctx.destination);
    chain = hp;
    return ctx;
  } catch {
    return null;
  }
}

function scheduleSuspend() {
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (active === 0 && ctx && ctx.state === 'running') void ctx.suspend().catch(() => {});
  }, IDLE_SUSPEND_MS);
}

/** Wake the context for a sound; `release` it when that sound is done. */
function acquire(): AudioContext | null {
  const c = create();
  if (!c) return null;
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  if (c.state === 'suspended') void c.resume().catch(() => {});
  active++;
  return c;
}

function release(afterMs = 0) {
  setTimeout(() => {
    active = Math.max(0, active - 1);
    if (active === 0) scheduleSuspend();
  }, afterMs);
}

if (typeof document !== 'undefined') {
  // Unlock once on the first tap, then let it sleep until a sound needs it.
  document.addEventListener(
    'pointerdown',
    () => {
      if (acquire()) release(0);
    },
    { capture: true, once: true },
  );
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.max(1, Math.ceil(c.sampleRate * seconds)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Key-up: a quick chirp and a burst of static, like a transmit button pressed. */
export function squelchOpen() {
  const c = acquire();
  if (!c || !chain) return;
  const t = c.currentTime;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.08);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  noise.connect(ng).connect(chain);
  noise.start(t);
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, t);
  osc.frequency.linearRampToValueAtTime(2100, t + 0.045);
  const og = c.createGain();
  og.gain.setValueAtTime(0.12, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(og).connect(chain);
  osc.start(t);
  osc.stop(t + 0.06);
  release(150);
}

/** Release: the longer "kssht" tail when the transmission ends. */
export function squelchClose() {
  const c = acquire();
  if (!c || !chain) return;
  const t = c.currentTime;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.2);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1900;
  band.Q.value = 0.7;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.45, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  noise.connect(band).connect(ng).connect(chain);
  noise.start(t);
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, t);
  osc.frequency.linearRampToValueAtTime(650, t + 0.05);
  const og = c.createGain();
  og.gain.setValueAtTime(0.08, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(og).connect(chain);
  osc.start(t);
  osc.stop(t + 0.07);
  release(300);
}

/** A faint static hiss under a spoken prompt. Call the returned stop() when it ends. */
export function staticBed(): () => void {
  const c = acquire();
  if (!c || !chain) return () => {};
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 1.3);
  src.loop = true;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2300;
  band.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 0.05);
  src.connect(band).connect(g).connect(chain);
  src.start();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.stop(t + 0.08);
    release(120);
  };
}

function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'square') {
  if (!chain) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.setValueAtTime(gain, t + dur - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(chain);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/**
 * Cockpit warning tones:
 * - `camera`: three quick high "lock" chirps (speed camera ahead)
 * - `notice`: one lower chirp (ANPR / surveillance camera)
 * - `caution`: the two-tone master-caution warble (crash check)
 */
export function warningTone(kind: 'camera' | 'notice' | 'caution') {
  const c = acquire();
  if (!c) return;
  let length = 0.3;
  if (kind === 'camera') {
    for (const at of [0, 0.14, 0.28]) tone(c, at, 1250, 0.09, 0.2);
    length = 0.4;
  } else if (kind === 'notice') {
    tone(c, 0, 900, 0.14, 0.2);
    length = 0.2;
  } else {
    for (let i = 0; i < 4; i++) tone(c, i * 0.16, i % 2 ? 980 : 720, 0.15, 0.22);
    length = 0.7;
  }
  release(length * 1000 + 100);
}
