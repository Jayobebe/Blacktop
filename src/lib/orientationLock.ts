import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Holding the screen the way it's turned now, and letting it go. The Android
 * app asks Android itself (NativeAudioRoute's lockScreenOrientation); a
 * browser uses the Screen Orientation API, which Chrome on Android allows in
 * an installed web app or full screen and refuses in a plain tab; iOS has no
 * way at all (the rider's own Rotation Lock is the answer there). Every call
 * is quiet when it can't: `lockScreen` says whether it held.
 */

interface OrientationPlugin {
  lockScreenOrientation(): Promise<void>;
  unlockScreenOrientation(): Promise<void>;
}
const Native = registerPlugin<OrientationPlugin>('NativeAudioRoute');

type LockableOrientation = { lock?: (o: string) => Promise<void>; unlock?: () => void; type?: string };

export async function lockScreen(): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      await Native.lockScreenOrientation();
      return true;
    } catch {
      return false; // an app built before this existed
    }
  }
  const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
  if (!o?.lock || !o.type) return false;
  try {
    await o.lock(o.type);
    return true;
  } catch {
    return false;
  }
}

export function unlockScreen() {
  if (Capacitor.getPlatform() === 'android') {
    void Native.unlockScreenOrientation().catch(() => {});
    return;
  }
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    /* nothing was held */
  }
}

/** iPhone and iPad (Safari, the installed web app, or an iOS app): no way to hold the screen from a page. */
export function cannotLockScreen(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
