import { useSyncExternalStore } from 'react';

/**
 * Bridge between the rescue feature (owned by ActiveRide) and the Blacktop map
 * overlay. The overlay renders above ActiveRide, so the rescue button and the
 * rescue route have to be reachable from inside the map too.
 */
export interface RescueTarget {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
}

interface RescueBridgeState {
  /** Location of the rider currently needing rescue (broadcast to everyone). */
  target: RescueTarget | null;
  /** Whether this device has an outstanding rescue request. */
  hasPending: boolean;
  /** Whether the rescue button should be offered on this device. */
  canRequest: boolean;
  send: (() => void | Promise<void>) | null;
  cancel: (() => void | Promise<void>) | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let state: RescueBridgeState = {
  target: null,
  hasPending: false,
  canRequest: false,
  send: null,
  cancel: null,
};

function emit() {
  listeners.forEach((l) => l());
}

export function setRescueTarget(target: RescueTarget) {
  const prev = state.target;
  if (prev && prev.userId === target.userId && prev.lat === target.lat && prev.lng === target.lng) return;
  state = { ...state, target };
  emit();
}

export function clearRescueTarget(userId?: string) {
  if (!state.target) return;
  if (userId && state.target.userId !== userId) return;
  state = { ...state, target: null };
  emit();
}

export function registerRescueControls(
  next: Pick<RescueBridgeState, 'hasPending' | 'canRequest' | 'send' | 'cancel'>,
) {
  if (
    state.hasPending === next.hasPending &&
    state.canRequest === next.canRequest &&
    state.send === next.send &&
    state.cancel === next.cancel
  ) {
    return;
  }
  state = { ...state, ...next };
  emit();
}

export function clearRescueControls() {
  registerRescueControls({ hasPending: false, canRequest: false, send: null, cancel: null });
}

export function useRescueBridge(): RescueBridgeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
