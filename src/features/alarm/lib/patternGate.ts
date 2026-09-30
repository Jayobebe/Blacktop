import { useSyncExternalStore } from 'react';

/**
 * Asks for the unlock pattern (the anti-theft alarm's) outside the alarm: to
 * set one (`'set'`, drawn twice) or to prove it (`'check'`). Resolves true once
 * it's set / drawn right, false if cancelled. PatternGateDialog (mounted once
 * in App.tsx) does the asking. Used by Public Road Privacy: hiding peaks needs a
 * pattern to exist, showing them again needs it drawn.
 */
export type PatternGateMode = 'set' | 'check';

interface Request {
  mode: PatternGateMode;
  title: string;
  reason: string;
  resolve: (ok: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function requestPattern(mode: PatternGateMode, title: string, reason: string): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = {
      mode,
      title,
      reason,
      resolve: (ok) => {
        current = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function usePatternGate(): Request | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
