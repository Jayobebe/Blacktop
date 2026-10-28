import { useEffect, useState } from 'react';

/**
 * Keeps something mounted for `ms` after it's asked to go, so it can fade or
 * slide out instead of vanishing: `mounted` says whether to render it, `shown`
 * whether it should be in (false for the first frame in, so it can slide in
 * from its out state, and while it's leaving).
 */
export function usePresence(show: boolean, ms = 220): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(show);
  const [shown, setShown] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      // A frame at the out state first, so the transition has somewhere to come from.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [show, ms]);
  return { mounted, shown };
}
