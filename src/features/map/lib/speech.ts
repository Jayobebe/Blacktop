// Spoken turn-by-turn prompts via the browser's built-in speech (Web Speech
// API). Works on Android Chrome and iOS Safari; iOS only lets speech start
// from a tap, so the first tap anywhere in the app unlocks it. Whether prompts
// are spoken at all is the Spoken Directions setting (useTurnByTurn checks it).
import { setAudioDucked } from '@/lib/audioDuck';
import { getLanguage } from '@/lib/i18n';
import { squelchOpen, squelchClose, staticBed } from '@/lib/radioFx';
import { pilotSay, pilotVoiceReady, stopPilotVoice } from '@/lib/pilotVoice';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** The native app speaks through the phone's own text-to-speech engine (Android's WebView has no Web Speech). */
const nativeTts = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech');

/** Whether the phone's own voice can speak here (the browser's, or the native app's engine). */
const plainVoiceAvailable = () => nativeTts() || speechSupported();

let voice: SpeechSynthesisVoice | null = null;
/** The radio-call voice: a male voice in the app's language where the phone names one. */
let radioVoice: SpeechSynthesisVoice | null = null;

// Browsers don't expose a voice's gender, only its name. These are the male
// system voices on iOS / macOS, Windows, Chrome and common Android engines.
const MALE_VOICE =
  /\b(male|man)\b|daniel|arthur|oliver|aaron|fred|alex|gordon|rishi|reed|rocko|ralph|albert|bruce|junior|eddy|grandpa|thomas|jacques|henri|nicolas|yannick|markus|hans|conrad|stefan|martin|luca|cosimo|diego|jorge|juan|carlos|pablo|enrique|joão|felipe|ricardo|xander|frank|maged|yuri|dmitri|ostap|otoya|hattori|ichiro|keita|daichi|minsu|injoon|yunxi|yunyang|kangkang|liang|ardi|hemant|madhur|ryan|guy|george|james|brian|david|mark|richard|william|liam|noah|elliot|christopher|eric|roger|steffan|thomas|tom\b/i;
const FEMALE_VOICE =
  /female|woman|samantha|victoria|karen|moira|tessa|serena|fiona|kate|susan|zira|hazel|libby|sonia|amelie|anna|helena|paulina|alice|monica|paula|luciana|joana|ellen|sara|nora|zuzana|yelda|milena|mei-?jia|ting-?ting|sin-?ji|yuna|kyoko|lekha|damayanti|catherine|allison|ava|nicky|siri female|jenny|aria|emma|olivia|natasha|clara|marie/i;

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
  const males = pool.filter((v) => MALE_VOICE.test(v.name) && !FEMALE_VOICE.test(v.name));
  radioVoice = males.find((v) => v.localService) ?? males[0] ?? null;
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

/** Plays a squelch; `key` is the opening chirp, otherwise the closing one (lib/radioFx). */
export function playSquelch(key: boolean) {
  if (key) squelchOpen();
  else squelchClose();
}

/**
 * Says a prompt. `interrupt` cuts off anything still being said (used for
 * "turn now" prompts, which matter more than a stale earlier one).
 *
 * Everything the app says is a fighter-pilot radio call (squelch key-up, a
 * static bed under the voice, squelch release; lib/radioFx), except turn-by-
 * turn directions (`kind: 'nav'`), which follow the rider's voice style: the
 * standard style keeps the phone's plain voice. `radio` forces either way.
 */
export function speak(text: string, opts: { interrupt?: boolean; radio?: boolean; kind?: 'nav' | 'callout' } = {}) {
  if (!text) return;
  const radio = opts.radio ?? (opts.kind === 'nav' ? style !== 'standard' : true);
  // Radio calls go out in the pilot voice when it's downloaded (lib/pilotVoice);
  // the phone's voice takes over if it isn't, or can't make the call in time.
  // Where the browser has no speech of its own (e.g. Android's WebView, as in the
  // Nimiq Pay mini app), the pilot voice says everything, plain directions too.
  if ((radio || !plainVoiceAvailable()) && pilotVoiceReady()) {
    if (opts.interrupt) cancelPlainVoice();
    const onStart = () => {
      speaking += 1;
      setAudioDucked(true);
    };
    const onEnd = () => {
      speaking = Math.max(0, speaking - 1);
      if (speaking === 0) setAudioDucked(false);
    };
    void pilotSay(text, { interrupt: opts.interrupt, onStart, onEnd }).then((ok) => {
      if (!ok) systemSpeak(text, radio, opts.interrupt);
    });
    return;
  }
  if (opts.interrupt) stopPilotVoice();
  systemSpeak(text, radio, opts.interrupt);
}

function cancelPlainVoice() {
  if (nativeTts()) void TextToSpeech.stop().catch(() => {});
  else if (speechSupported()) window.speechSynthesis.cancel();
}

/** The native app's engine: same radio treatment and ducking as the browser's voice. */
function nativeSpeak(text: string, radio: boolean, interrupt?: boolean) {
  let stopStatic: (() => void) | null = null;
  speaking += 1;
  setAudioDucked(true);
  const done = () => {
    stopStatic?.();
    stopStatic = null;
    if (radio) squelchClose();
    speaking = Math.max(0, speaking - 1);
    if (speaking === 0) setAudioDucked(false);
  };
  const say = () => {
    if (radio) stopStatic = staticBed();
    TextToSpeech.speak({
      text,
      lang: speechLang(),
      rate: radio ? 1.12 : 1,
      pitch: radio ? 0.75 : 1,
      queueStrategy: interrupt ? QueueStrategy.Flush : QueueStrategy.Add,
    })
      .catch(() => {})
      .finally(done);
  };
  if (radio) {
    squelchOpen();
    setTimeout(say, 110);
  } else {
    say();
  }
}

function systemSpeak(text: string, radio: boolean, interrupt?: boolean) {
  if (nativeTts()) return nativeSpeak(text, radio, interrupt);
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const chosen = radio ? radioVoice ?? voice : voice;
  if (chosen) {
    u.voice = chosen;
    u.lang = chosen.lang;
  } else {
    u.lang = speechLang();
  }
  // Clipped, quick radio delivery, pitched down: a male voice where the phone
  // names one, otherwise the default voice lowered as far as it still sounds natural.
  u.rate = radio ? 1.12 : 1;
  u.pitch = radio ? (radioVoice ? 0.8 : 0.62) : 1;
  let started = false;
  let stopStatic: (() => void) | null = null;
  const done = () => {
    if (!started) return;
    started = false;
    stopStatic?.();
    stopStatic = null;
    if (radio) squelchClose();
    speaking = Math.max(0, speaking - 1);
    if (speaking === 0) setAudioDucked(false);
  };
  u.onstart = () => {
    started = true;
    speaking += 1;
    setAudioDucked(true);
    if (radio) stopStatic = staticBed();
  };
  u.onend = done;
  u.onerror = done;
  // Chrome can sit paused after the tab was hidden; resume before speaking.
  if (synth.paused) synth.resume();
  if (radio) {
    squelchOpen();
    setTimeout(() => synth.speak(u), 110);
  } else {
    synth.speak(u);
  }
}

export function stopSpeaking() {
  stopPilotVoice();
  if (!plainVoiceAvailable()) return;
  cancelPlainVoice();
  speaking = 0;
  setAudioDucked(false);
}
