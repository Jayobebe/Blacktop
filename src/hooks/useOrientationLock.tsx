import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
}

const OrientationContext = createContext<OrientationContextType | null>(null);

function getOrientation(): 'portrait' | 'landscape' {
  if (typeof window === 'undefined') return 'portrait';
  
  // Use Screen Orientation API - only fires when device fully commits to portrait/landscape
  if (screen.orientation?.type) {
    return screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
  }
  
  // Fallback to window dimensions
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export function useOrientationLock() {
  const ctx = useContext(OrientationContext);
  return ctx?.orientation ?? ('portrait' as const);
}

export function OrientationProvider({
  children,
  debounceMs = 250,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => getOrientation());

  useEffect(() => {
    let t: number | null = null;

    const onViewportChange = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        setOrientation(getOrientation());
      }, debounceMs);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [debounceMs]);

  useEffect(() => {
    document.documentElement.classList.remove('app-portrait', 'app-landscape');
    document.documentElement.classList.add(`app-${orientation}`);
  }, [orientation]);

  const ctxValue = useMemo<OrientationContextType>(
    () => ({ orientation }),
    [orientation]
  );

  return (
    <OrientationContext.Provider value={ctxValue}>
      {children}
    </OrientationContext.Provider>
  );
}
