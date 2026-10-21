/**
 * Navigation from Blacktop Console: every screen opened from it is marked
 * (`fromConsole` in the history state), so its header's Back goes back through
 * history to the Console card it came from, not to the screen's usual parent
 * (Crew Leaderboards' Back is Blacktop World when opened there; from the
 * Console it was World and then the Console). `PageHeader` reads the mark.
 */
import { useCallback } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router-dom';

export function useConsoleNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string, opts?: NavigateOptions) => {
      const state = opts?.state && typeof opts.state === 'object' ? opts.state : {};
      navigate(to, { ...opts, state: { ...state, fromConsole: true } });
    },
    [navigate],
  );
}

/** Whether this page was opened from the Console (its Back goes back there). */
export const openedFromConsole = (state: unknown): boolean =>
  !!state && typeof state === 'object' && (state as { fromConsole?: unknown }).fromConsole === true;
