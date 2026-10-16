// Lowers other app audio (voice chat, Blacktop Radio) while something more
// important is being said, e.g. a turn-by-turn prompt. Players read
// duckVolume() for their target volume and re-apply it when this changes.
// iOS ignores element volume, so there it's a no-op and the prompt simply
// plays over the top.

const DUCKED = 0.3;
let ducked = false;
const listeners = new Set<() => void>();

export function setAudioDucked(next: boolean) {
  if (ducked === next) return;
  ducked = next;
  listeners.forEach((l) => l());
}

/** Volume other players should use right now (1 when nothing is ducking them). */
export function duckVolume(): number {
  return ducked ? DUCKED : 1;
}

// Blacktop Radio also dips while someone in the convoy is talking (their own
// voice chat stays at full volume, so this is separate from the prompt duck).
const TALK_DUCKED = 0.25;
let talkDucked = false;

export function setTalkDucked(next: boolean) {
  if (talkDucked === next) return;
  talkDucked = next;
  listeners.forEach((l) => l());
}

/** Volume Blacktop Radio should play at right now: down for a prompt or while a convoy mate talks. */
export function radioVolume(): number {
  return Math.min(duckVolume(), talkDucked ? TALK_DUCKED : 1);
}

export function onAudioDuckChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
