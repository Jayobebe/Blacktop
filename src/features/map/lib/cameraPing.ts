// Camera alerts as cockpit warning tones through the app's radio sound
// (lib/radioFx): three quick high chirps for a speed camera, one lower chirp
// for ANPR / surveillance cameras.
import { warningTone } from '@/lib/radioFx';

/** 3 quick high chirps for a speed camera. */
export function pingSpeedCamera() {
  warningTone('camera');
}

/** Single lower chirp for ANPR / surveillance cameras. */
export function pingAnprCamera() {
  warningTone('notice');
}
