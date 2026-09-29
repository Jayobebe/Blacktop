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

/** Hard-clipped, band-limited noise: the harsh "kssh" of a radio squelch. */
function squawk(c: AudioContext, at: number, dur: number, gain: number, centre: number) {
  if (!chain) return;
  const t = c.currentTime + at;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, dur + 0.02);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = centre;
  band.Q.value = 1.4;
  const clip = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.max(-0.6, Math.min(0.6, x * 6)); // hard clip: gritty, not hissy
  }
  clip.curve = curve;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setValueAtTime(gain, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(clip).connect(band).connect(g).connect(chain);
  noise.start(t);
  noise.stop(t + dur + 0.02);
}

/** A click: a single sharp pop, as the transmit relay closes. */
function pop(c: AudioContext, at: number, gain: number) {
  if (!chain) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.012), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (i < 6 ? 1 : Math.random() * 2 - 1) * Math.exp(-i / 60);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(chain);
  src.start(t);
}

/** Key-up: the transmit click and a short squawk, like the button being pressed. */
export function squelchOpen() {
  const c = acquire();
  if (!c || !chain) return;
  pop(c, 0, 0.9);
  squawk(c, 0.005, 0.07, 0.55, 1600);
  release(150);
}

/**
 * End of transmission: the two-tone roger beep, then the squawk tail as the
 * squelch closes.
 */
export function squelchClose() {
  const c = acquire();
  if (!c || !chain) return;
  tone(c, 0, 1250, 0.07, 0.24);
  tone(c, 0.075, 1900, 0.09, 0.24);
  squawk(c, 0.19, 0.22, 0.6, 1400);
  pop(c, 0.4, 0.5);
  release(550);
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
  g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.05);
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

/** Decode a spoken call (WAV from the pilot voice) for playRadioVoice. */
export async function decodeRadio(wav: ArrayBuffer): Promise<AudioBuffer | null> {
  const c = create();
  if (!c) return null;
  try {
    return await c.decodeAudioData(wav);
  } catch {
    return null;
  }
}

let voiceIn: AudioNode | null = null;

/**
 * The voice's own stage before the shared chain: a narrow headset-mic band
 * with a honky mid boost, driven hard, like a pilot's boom mic over UHF.
 */
function voiceChain(c: AudioContext): AudioNode | null {
  if (voiceIn) return voiceIn;
  if (!chain) return null;
  const hp1 = c.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 480;
  const hp2 = c.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 480;
  const mid = c.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1500;
  mid.Q.value = 1.1;
  mid.gain.value = 8;
  const lp1 = c.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.frequency.value = 2700;
  const lp2 = c.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 2700;
  const pre = c.createGain();
  pre.gain.value = 2.2;
  const drive = c.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    // Soft clip, then a little quantising grit.
    curve[i] = Math.round(Math.tanh(3.2 * x) * 48) / 48;
  }
  drive.curve = curve;
  drive.oversample = '2x';
  const post = c.createGain();
  post.gain.value = 0.55;
  hp1.connect(hp2).connect(mid).connect(lp1).connect(lp2).connect(pre).connect(drive).connect(post).connect(chain);
  voiceIn = hp1;
  return voiceIn;
}

/**
 * Transmit a spoken call: key-up squelch, the voice through the radio with a
 * static bed under it, then the roger beep and squelch tail. `stop()` cuts it
 * short (still ending with the release); `done` resolves once it's over.
 */
export function playRadioVoice(buf: AudioBuffer): { stop: () => void; done: Promise<void> } {
  const c = acquire();
  const input = c ? voiceChain(c) : null;
  if (!c || !input) {
    if (c) release(0);
    return { stop: () => {}, done: Promise.resolve() };
  }
  squelchOpen();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(input);
  const startAt = c.currentTime + 0.1;
  let stopStatic: (() => void) | null = null;
  const staticTimer = setTimeout(() => (stopStatic = staticBed()), 90);
  let finished = false;
  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => (resolve = r));
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(staticTimer);
    stopStatic?.();
    squelchClose();
    release(0);
    resolve();
  };
  src.onended = finish;
  src.start(startAt);
  return {
    stop: () => {
      if (finished) return;
      try {
        src.stop();
      } catch {
        finish();
      }
    },
    done,
  };
}

// ---- Anti-theft alarm --------------------------------------------------------

/**
 * Keep the context awake while the alarm is armed: the siren has to be able to
 * start with nobody touching the screen (iOS won't start audio without a
 * gesture). Returns the release.
 */
export function holdAudio(): () => void {
  const c = acquire();
  if (!c) return () => {};
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release(0);
  };
}

/** Alarm chirps, through the radio chain like every other beep. */
export function alarmChirp(kind: 'arm' | 'disarm' | 'nudge' | 'entry') {
  const c = acquire();
  if (!c) return;
  let length = 0.3;
  if (kind === 'arm') {
    tone(c, 0, 880, 0.09, 0.22);
    tone(c, 0.13, 1320, 0.12, 0.22);
    length = 0.3;
  } else if (kind === 'disarm') {
    tone(c, 0, 1320, 0.09, 0.2);
    tone(c, 0.13, 880, 0.14, 0.2);
  } else if (kind === 'nudge') {
    tone(c, 0, 1500, 0.07, 0.24);
    length = 0.12;
  } else {
    tone(c, 0, 1800, 0.06, 0.28);
    tone(c, 0.1, 1800, 0.06, 0.28);
    length = 0.2;
  }
  release(length * 1000 + 100);
}

/**
 * The siren: a loud rising-and-falling two-oscillator wail straight to the
 * speaker (not through the narrow comms band, it needs every decibel), behind
 * a limiter so it doesn't clip. Runs until the returned stop is called.
 */
export function alarmSiren(): () => void {
  const c = acquire();
  if (!c) return () => {};
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  out.connect(limiter).connect(c.destination);

  const a = c.createOscillator();
  a.type = 'sawtooth';
  a.frequency.value = 1050;
  const b = c.createOscillator();
  b.type = 'square';
  b.frequency.value = 1060;
  const mixA = c.createGain();
  mixA.gain.value = 0.55;
  const mixB = c.createGain();
  mixB.gain.value = 0.35;
  a.connect(mixA).connect(out);
  b.connect(mixB).connect(out);
  // The wail: both sweep ±450 Hz about once a second.
  const lfo = c.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 0.95;
  const depth = c.createGain();
  depth.gain.value = 450;
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  a.start(t);
  b.start(t);
  lfo.start(t);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = c.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    for (const o of [a, b, lfo]) {
      try {
        o.stop(now + 0.15);
      } catch {
        /* already stopped */
      }
    }
    release(200);
  };
}
