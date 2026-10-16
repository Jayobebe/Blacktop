import { useSyncExternalStore } from 'react';

/** The `short:` screen in tailwind.config.ts: a phone on its side, where the keyboard takes most of the height. */
const QUERY = '(orientation: landscape) and (max-height: 560px)';

const subscribe = (cb: () => void) => {
  const m = window.matchMedia?.(QUERY);
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
};
const read = () => !!window.matchMedia?.(QUERY).matches;

export function useShortLandscape(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
