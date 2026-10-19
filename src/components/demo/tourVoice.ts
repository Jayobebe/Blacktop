/**
 * The demo tour's narration: recorded lines in the pilot voice
 * (public/tour-voice, made by scripts/make-tour-voice.py), played through the
 * radio chain like any pilot call. Nothing is made on the phone, so the tour
 * always sounds the same, cockpit voice, on time, whatever the rider set and
 * whether or not they downloaded the pilot voice. Before, a first run handed
 * the lines the engine wasn't ready for to the phone's own voice: two voices,
 * out of time.
 *
 * Languages with no pilot voice (uk, ja, ko, zh, id, hi) have no recordings and
 * use the phone's voice in radio style for every line. Where there are
 * recordings, a line that can't be loaded (offline before it was fetched) is
 * left unsaid rather than said in another voice.
 */
import { getLanguage } from '@/lib/i18n';
import { decodeRadio, playRadioVoice } from '@/lib/radioFx';
import { setAudioDucked } from '@/lib/audioDuck';
import { speak, stopSpeaking } from '@/features/map/lib/speech';

/** A line's file name: FNV-1a of the text as spoken (the same sum as make-tour-voice.py). */
export function voiceId(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

let index: Promise<Record<string, string[]>> | null = null;
function recorded(): Promise<Set<string> | null> {
  index ??= fetch('/tour-voice/index.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return index.then((all) => {
    const ids = all[getLanguage()];
    return ids?.length ? new Set(ids) : null;
  });
}

const clips = new Map<string, Promise<AudioBuffer | null>>();
function clip(id: string): Promise<AudioBuffer | null> {
  let p = clips.get(id);
  if (!p) {
    p = fetch(`/tour-voice/${getLanguage()}/${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? decodeRadio(b) : null))
      .catch(() => null);
    clips.set(id, p);
    // A failed fetch can be tried again next time.
    void p.then((buf) => {
      if (!buf) clips.delete(id);
    });
  }
  return p;
}

/** Load these lines ahead of when they're said (a chapter's, while the one before plays). */
export function prepareTourLines(lines: string[]) {
  void recorded().then((have) => {
    if (!have) return;
    for (const text of lines) {
      const id = voiceId(text);
      if (have.has(id)) void clip(id);
    }
  });
}

let generation = 0;
let current: { stop: () => void } | null = null;
let chain: Promise<void> = Promise.resolve();

/** Say a line of the tour: its recording where there is one, else the phone's voice in radio style. */
export function tourSay(text: string) {
  const gen = generation;
  void recorded().then((have) => {
    if (gen !== generation) return;
    const id = voiceId(text);
    if (!have || !have.has(id)) {
      speak(text, { radio: true });
      return;
    }
    const buf = clip(id);
    // One line after another, never two at once.
    chain = chain.then(async () => {
      const b = await buf;
      if (!b || gen !== generation) return;
      setAudioDucked(true);
      const tx = playRadioVoice(b);
      current = tx;
      await tx.done;
      if (current === tx) current = null;
      setAudioDucked(false);
      await new Promise((r) => setTimeout(r, 120));
    });
  });
}

/** Cut the narration off (a chapter change, the sound going off, leaving the tour). */
export function stopTourVoice() {
  generation++;
  current?.stop();
  current = null;
  chain = Promise.resolve();
  setAudioDucked(false);
  stopSpeaking();
}
