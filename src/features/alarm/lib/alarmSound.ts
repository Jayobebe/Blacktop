import { Capacitor, registerPlugin } from '@capacitor/core';
import { alarmChirp as webChirp, alarmSiren as webSiren } from '@/lib/radioFx';

export type AlarmChirp = 'arm' | 'disarm' | 'nudge' | 'entry';

interface AlarmSoundPlugin {
  startSiren(): Promise<void>;
  stopSiren(): Promise<void>;
  chirp(options: { kind: AlarmChirp }): Promise<void>;
  pinApp(): Promise<void>;
  unpinApp(): Promise<void>;
}

const AlarmSound = registerPlugin<AlarmSoundPlugin>('AlarmSound');

/**
 * The apps make the alarm's sounds natively (AlarmSoundPlugin: Android in
 * android/, iOS in native/ios once added, see ios-setup.md), on the phone's own
 * loudspeaker even with a Bluetooth headset or intercom connected (voice chat
 * and turn-by-turn keep using it). Builds without the plugin and the browser
 * fall back to Web Audio, which goes wherever the phone sends sound.
 */
const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AlarmSound');

export function playAlarmChirp(kind: AlarmChirp) {
  if (!native()) return webChirp(kind);
  AlarmSound.chirp({ kind }).catch(() => webChirp(kind));
}

/** Starts the siren; returns its stop. */
export function startAlarmSiren(): () => void {
  if (!native()) return webSiren();
  let stopped = false;
  let webStop: (() => void) | null = null;
  AlarmSound.startSiren().catch(() => {
    if (!stopped) webStop = webSiren();
  });
  return () => {
    if (stopped) return;
    stopped = true;
    if (webStop) webStop();
    else AlarmSound.stopSiren().catch(() => {});
  };
}

/**
 * Android app: pin the screen while the lock is up, so swiping home can't walk
 * away from it (elsewhere there's nothing to pin; the lock screen still stands).
 */
export function pinForAlarm(on: boolean) {
  if (!native()) return;
  (on ? AlarmSound.pinApp() : AlarmSound.unpinApp()).catch(() => {});
}
