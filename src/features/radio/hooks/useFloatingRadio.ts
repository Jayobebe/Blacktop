import { useSyncExternalStore } from 'react';

export interface FloatingRadioState {
  /** Docked = sitting in the home header slot. Undocked = free-floating overlay. */
  docked: boolean;
  /** Position of the floating button as a fraction of the viewport (0-1). */
  x: number;
  y: number;
}

const KEY = 'blacktop_floating_radio';

function load(): FloatingRadioState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FloatingRadioState>;
      return {
        docked: parsed.docked !== false,
        x: typeof parsed.x === 'number' ? parsed.x : 0.82,
        y: typeof parsed.y === 'number' ? parsed.y : 0.72,
      };
    }
  } catch { /* fall through to defaults */ }
  return { docked: true, x: 0.82, y: 0.72 };
}

let state: FloatingRadioState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function setFloatingRadio(patch: Partial<FloatingRadioState>) {
  state = { ...state, ...patch };
  emit();
}

export function undockRadio(x: number, y: number) {
  setFloatingRadio({ docked: false, x, y });
}

export function dockRadio() {
  setFloatingRadio({ docked: true });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() { return state; }

export function useFloatingRadio() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
