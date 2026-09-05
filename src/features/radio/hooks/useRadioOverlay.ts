import { useSyncExternalStore } from 'react';

let isOpen = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function openRadioOverlay() {
  if (isOpen) return;
  isOpen = true;
  emit();
}

export function closeRadioOverlay() {
  if (!isOpen) return;
  isOpen = false;
  emit();
}

export function toggleRadioOverlay() {
  isOpen = !isOpen;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() { return isOpen; }

export function useRadioOverlay() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
