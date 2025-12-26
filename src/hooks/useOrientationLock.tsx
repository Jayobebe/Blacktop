import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
}

const OrientationContext = createContext<OrientationContextType | null>(null);

function getOrientationFromDimensions(): 'portrait' | 'landscape' {
  if (typeof window === 'undefined') return 'portrait';
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export function useOrientationLock() {
  const ctx = useContext(OrientationContext);
  return {
    orientation: ctx?.orientation ?? ('portrait' as const),
  };
}

export function OrientationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(getOrientationFromDimensions);

  useEffect(() => {
    const handleResize = () => {
      setOrientation(getOrientationFromDimensions());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

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
