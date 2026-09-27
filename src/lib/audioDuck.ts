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

export function onAudioDuckChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
