/**
 * Whether a Track Day session is timing right now, without loading Track Day:
 * Home asks on launch (a restored ride goes back to /track, not /ride), and
 * importing the session module for that pulled the timer, pits and link code
 * into the first load. `session.ts` keeps this in step.
 */
let running = false;

export function setRacerRunning(on: boolean) {
  running = on;
}

export function isRacerRunning(): boolean {
  return running;
}
