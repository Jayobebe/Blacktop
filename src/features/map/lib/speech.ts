// Spoken turn-by-turn prompts via the browser's built-in speech (Web Speech
// API). Works on Android Chrome and iOS Safari; iOS only lets speech start
// from a tap, so the first tap anywhere in the app unlocks it. Whether prompts
// are spoken at all is the Spoken Directions setting (useTurnByTurn checks it).
import { setAudioDucked } from '@/lib/audioDuck';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

let voice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (!speechSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const lang = (navigator.language || 'en-GB').toLowerCase();
  const base = lang.split('-')[0];
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === lang);
  const sameBase = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  // The prompts are written in English, so fall back to any English voice.
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = base === 'en' ? (exact.length ? exact : sameBase) : english;
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

/**
 * Says a prompt. `interrupt` cuts off anything still being said (used for
 * "turn now" prompts, which matter more than a stale earlier one).
 */
export function speak(text: string, opts: { interrupt?: boolean } = {}) {
  if (!speechSupported() || !text) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-GB';
  }
  u.rate = 1;
  u.pitch = 1;
  let started = false;
  const done = () => {
    if (!started) return;
    started = false;
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
  synth.speak(u);
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  speaking = 0;
  setAudioDucked(false);
}
