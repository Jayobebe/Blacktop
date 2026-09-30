import { sceneCue, type SceneCueKind } from '@/lib/radioFx';

/** Settings → Your Blacktop → App sounds (read straight from storage, so module code can ask). */
export function appSoundsOn(): boolean {
  try {
    return JSON.parse(localStorage.getItem('blacktop-settings') ?? '{}')?.uiSoundsEnabled !== false;
  } catch {
    return true;
  }
}

/**
 * A sound for something that happened in the app (a rider joining, a card
 * collected, a badge banked). Follows the App sounds switch; alerts (hazards,
 * cameras, crash check, alarm, directions, lap timing) call radioFx directly
 * and always sound.
 */
export function eventSound(kind: SceneCueKind) {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !appSoundsOn()) return;
  sceneCue(kind);
}
