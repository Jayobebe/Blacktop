import { useEffect, useState } from 'react';

/**
 * True for a moment after a sideways strip appears (the search suggestions on
 * a phone on its side): its items give a small slide left and back, to show
 * it scrolls (`.suggest-nudge` in index.css). Once per appearance, so new
 * results arriving while typing don't set it off again.
 */
export function useStripNudge(shown: boolean): boolean {
  const [nudging, setNudging] = useState(false);
  useEffect(() => {
    if (!shown) return;
    setNudging(true);
    const t = window.setTimeout(() => setNudging(false), 1500);
    return () => {
      window.clearTimeout(t);
      setNudging(false);
    };
  }, [shown]);
  return nudging;
}
