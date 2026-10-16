/**
 * Who answers the phone's media buttons (a headset's or intercom's play /
 * pause, the lock screen's controls): convoy voice while the rider is in it
 * (the button mutes and unmutes the mic), else Blacktop Radio. Each sets its
 * own layer; the top one present is the one the phone gets. Imports nothing.
 */

export type MediaKeyHandlers = Partial<Record<'play' | 'pause' | 'nexttrack' | 'previoustrack' | 'stop' | 'togglemicrophone', () => void>>;

type Layer = 'voice' | 'radio';
const ORDER: Layer[] = ['voice', 'radio'];
const layers = new Map<Layer, MediaKeyHandlers>();
const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack', 'stop', 'togglemicrophone'] as const;

function apply() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!ms) return;
  const top = ORDER.map((l) => layers.get(l)).find(Boolean) ?? {};
  for (const action of ACTIONS) {
    try {
      ms.setActionHandler(action as MediaSessionAction, top[action] ?? null);
    } catch {
      /* this browser doesn't know the action (togglemicrophone is newer) */
    }
  }
}

/** Sets (or, with null, removes) one layer's handlers. */
export function setMediaKeys(layer: Layer, handlers: MediaKeyHandlers | null) {
  if (handlers) layers.set(layer, handlers);
  else layers.delete(layer);
  apply();
}

/** True while convoy voice holds the buttons (the radio leaves the lock-screen controls alone then). */
export const voiceHoldsMediaKeys = () => layers.has('voice');
