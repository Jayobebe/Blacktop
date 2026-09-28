import { speak } from '@/features/map';

/**
 * Pit board calls, spoken as well as shown: a rider in a helmet hears them
 * through their intercom without looking down, and the crew hears the rider's
 * calls. Speech ducks voice chat and radio while it talks (lib/audioDuck).
 */

/** How each preset is said (radio style: the urgent ones twice). */
const SAY: Record<string, string> = {
  BOX: 'Box, box.',
  PUSH: 'Push, push.',
  OK: 'O K.',
  FUEL: 'Fuel.',
  SLOW: 'Slow down.',
  'LAST LAP': 'Last lap.',
  'P+1': 'Gained a place.',
  'P-1': 'Lost a place.',
};

/** Crew → rider. Custom boards are read as written. */
export function speakPitBoard(text: string) {
  const t = String(text).trim().slice(0, 40);
  if (!t) return;
  speak(SAY[t.toUpperCase()] ?? `Pit board: ${t}.`, { interrupt: true });
}

/** Rider → crew. */
export function speakRiderCall(text: string) {
  const t = String(text).trim().slice(0, 40);
  if (t) speak(`Rider: ${t}.`, { interrupt: true });
}
