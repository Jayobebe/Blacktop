import { speak } from '@/features/map';
import { tr } from '@/lib/i18n';

/**
 * Pit board calls, spoken as well as shown: a rider in a helmet hears them
 * through their intercom without looking down, and the crew hears the rider's
 * calls. Speech ducks voice chat and radio while it talks (lib/audioDuck).
 *
 * Presets travel as their English ids (PIT_PRESETS, RIDER_CALLS) and each
 * phone shows and says them in its own language.
 */

/** How each preset is said (radio style: the urgent ones twice). */
const SAY: Record<string, string> = {
  BOX: tr("Box, box."),
  PUSH: tr("Push, push."),
  OK: tr("O K."),
  FUEL: tr("Fuel."),
  SLOW: tr("Slow down."),
  'LAST LAP': tr("Last lap."),
  'P+1': tr("Gained a place."),
  'P-1': tr("Lost a place."),
};

const LABEL: Record<string, string> = {
  BOX: tr("BOX"),
  PUSH: tr("PUSH"),
  OK: tr("OK"),
  FUEL: tr("FUEL"),
  SLOW: tr("SLOW"),
  'LAST LAP': tr("LAST LAP"),
  'Coming in': tr("Coming in"),
  Problem: tr("Problem"),
  'All good': tr("All good"),
};

/** A preset's text in this phone's language; custom boards as written. */
export function pitLabel(text: string): string {
  return LABEL[String(text).trim()] ?? LABEL[String(text).trim().toUpperCase()] ?? text;
}

/** Crew → rider. Custom boards are read as written. */
export function speakPitBoard(text: string) {
  const t = String(text).trim().slice(0, 40);
  if (!t) return;
  speak(SAY[t.toUpperCase()] ?? tr("Pit board: {0}.", [t]), { interrupt: true, radio: true });
}

/** Rider → crew. */
export function speakRiderCall(text: string) {
  const t = String(text).trim().slice(0, 40);
  if (t) speak(tr("Rider: {0}.", [pitLabel(t)]), { interrupt: true, radio: true });
}
