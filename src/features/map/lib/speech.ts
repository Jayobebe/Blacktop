// Spoken turn-by-turn prompts via the browser's built-in speech (Web Speech
// API). Works on Android Chrome and iOS Safari; iOS only lets speech start
// from a tap, so the first tap anywhere in the app unlocks it. Whether prompts
// are spoken at all is the Spoken Directions setting (useTurnByTurn checks it).
import { setAudioDucked } from '@/lib/audioDuck';
import { getLanguage } from '@/lib/i18n';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

let voice: SpeechSynthesisVoice | null = null;

/** The prompts are in the app's language: the phone's own locale when that matches, else a sensible default. */
function speechLang(): string {
  const app = getLanguage();
  const phone = navigator.language || '';
  if (phone.toLowerCase().split(/[-_]/)[0] === app) return phone;
  return app === 'en' ? 'en-GB' : app;
}

function pickVoice() {
  if (!speechSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const lang = speechLang().toLowerCase();
  const base = lang.split('-')[0];
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === lang);
  // Norwegian voices come as nb, no or nn.
  const bases = base === 'nb' ? ['nb', 'no', 'nn'] : [base];
  const sameBase = voices.filter((v) => bases.some((b) => v.lang.toLowerCase().startsWith(b)));
  const pool = exact.length ? exact : sameBase;
  voice = pool.find((v) => v.localService) ?? pool[0] ?? null;
}

if (speechSupported()) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);

  // iOS: speech has to be started once from a user gesture before it can be
  // started from a GPS callback. A silent utterance on the first tap does it.
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      // Not fatal: prompts just stay silent until the next tap.
    }
    document.removeEventListener('pointerdown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
}

let speaking = 0;

export type VoiceStyle = 'standard' | 'cockpit' | 'rally';
let style: VoiceStyle = 'standard';
export function setVoiceStyle(s: VoiceStyle) {
  style = s;
}
export function getVoiceStyle(): VoiceStyle {
  return style;
}

// Radio squelch: a short burst of band-passed static plus a keying chirp,
// made on the fly with Web Audio (no sound files, nothing downloaded).
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => audioCtx(), { capture: true, once: true });
}

/** Plays a squelch; `key` is the opening chirp, otherwise the closing one. */
export function playSquelch(key: boolean) {
  const c = audioCtx();
  if (!c) return;
  const t = c.currentTime;
  const dur = key ? 0.09 : 0.16;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800;
  band.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.18, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(band).connect(ng).connect(c.destination);
  noise.start(t);
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(key ? 1400 : 1000, t);
  osc.frequency.linearRampToValueAtTime(key ? 2000 : 700, t + 0.05);
  const og = c.createGain();
  og.gain.setValueAtTime(0.06, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.07);
}

/**
 * Says a prompt. `interrupt` cuts off anything still being said (used for
 * "turn now" prompts, which matter more than a stale earlier one).
 * `radio` forces the radio treatment (pit calls); otherwise it follows the
 * rider's voice style.
 */
export function speak(text: string, opts: { interrupt?: boolean; radio?: boolean } = {}) {
  if (!speechSupported() || !text) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt) synth.cancel();
  const radio = opts.radio ?? style !== 'standard';
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = speechLang();
  }
  // Clipped, quick radio delivery.
  u.rate = radio ? 1.15 : 1;
  u.pitch = radio ? 0.85 : 1;
  let started = false;
  const done = () => {
    if (!started) return;
    started = false;
    if (radio) playSquelch(false);
    speaking = Math.max(0, speaking - 1);
    if (speaking === 0) setAudioDucked(false);
  };
  u.onstart = () => {
    started = true;
    speaking += 1;
    setAudioDucked(true);
  };
  u.onend = done;
  u.onerror = done;
  // Chrome can sit paused after the tab was hidden; resume before speaking.
  if (synth.paused) synth.resume();
  if (radio) {
    playSquelch(true);
    setTimeout(() => synth.speak(u), 110);
  } else {
    synth.speak(u);
  }
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  speaking = 0;
  setAudioDucked(false);
}
