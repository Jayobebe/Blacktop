import { useEffect, useSyncExternalStore } from 'react';

/**
 * Full screen inside the Nimiq Pay mini app. Newer Nimiq Pay hosts inject
 * `window.nimiqPay.requestFullscreen` (and friends, @nimiq/mini-app-sdk 0.2.4);
 * older hosts and every other browser don't, and then none of this shows.
 * Nimiq's rule: the app asks the rider before every request (Nimiq Pay shows
 * no prompt of its own). The rider leaves with the host's button or Android
 * Back; it also ends when the app goes to the background.
 */
interface FullscreenHost {
  requestFullscreen?: () => Promise<void>;
  exitFullscreen?: () => Promise<void>;
  getFullscreen?: () => Promise<boolean>;
  onFullscreenChange?: (listener: (enabled: boolean) => void) => () => void;
}

const host = (): FullscreenHost | undefined => (globalThis as { nimiqPay?: FullscreenHost }).nimiqPay;

/** This Nimiq Pay can go full screen. */
export function canNimiqFullscreen(): boolean {
  return typeof host()?.requestFullscreen === 'function';
}

let on = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  if (on === v) return;
  on = v;
  listeners.forEach((l) => l());
};

let watching = false;
function watch() {
  if (watching || !canNimiqFullscreen()) return;
  watching = true;
  try {
    host()?.onFullscreenChange?.((enabled) => set(!!enabled));
  } catch {
    /* host without change events: refreshed on resume instead */
  }
  const refresh = () => {
    void host()
      ?.getFullscreen?.()
      .then((v) => set(!!v))
      .catch(() => {});
  };
  refresh();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

/** Whether the mini app is full screen now. */
export function useNimiqFullscreen(): boolean {
  useEffect(watch, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
    () => false,
  );
}

/** Only after the rider said yes in Blacktop's own prompt. */
export async function enterNimiqFullscreen(): Promise<boolean> {
  try {
    await host()?.requestFullscreen?.();
    set(true);
    return true;
  } catch {
    return false;
  }
}

export async function exitNimiqFullscreen(): Promise<void> {
  try {
    await host()?.exitFullscreen?.();
  } catch {
    /* already out */
  }
  set(false);
}

/** The launch prompt: asked each launch unless the rider said not to. */
const KEY = 'bt.nimiq_fullscreen_prompt';
export function fullscreenPromptMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}
export function muteFullscreenPrompt(muted: boolean) {
  try {
    if (muted) localStorage.setItem(KEY, 'off');
    else localStorage.removeItem(KEY);
  } catch {
    /* this launch only */
  }
}

/** The prompt's open handles (components/NimiqFullscreenPrompt). */
export const fullscreenPromptOpeners = new Set<() => void>();

/** Settings' "Go full screen": the same prompt (Nimiq wants the rider asked every time). */
export function askNimiqFullscreen() {
  fullscreenPromptOpeners.forEach((o) => o());
}
