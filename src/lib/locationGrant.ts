/**
 * iOS (Safari and the home-screen app) forgets a site's location grant when the
 * app closes and reports "prompt" again, though the next GPS request gets it
 * back without asking. Anything that gets a fix notes it here, so the safety
 * card doesn't show crash rescue as paused after every relaunch.
 */
const KEY = 'blacktop_location_granted';

export function noteLocationGranted() {
  try {
    if (localStorage.getItem(KEY) !== '1') localStorage.setItem(KEY, '1');
  } catch {
    /* this session only */
  }
}

export function locationWasGranted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
