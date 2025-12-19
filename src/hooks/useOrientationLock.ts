import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
  deviceOrientation: 'portrait' | 'landscape';
  hasPendingRotation: boolean;
  applyRotation: () => void;
}

const OrientationContext = createContext<OrientationContextType | null>(null);

export function useOrientationLock() {
  const context = useContext(OrientationContext);
  if (!context) {
    return typeof window !== 'undefined' && window.innerWidth > window.innerHeight
      ? 'landscape'
      : 'portrait';
  }
  return context.orientation;
}

export function useOrientationControl() {
  const context = useContext(OrientationContext);
  if (!context) {
    throw new Error('useOrientationControl must be used within OrientationProvider');
  }
  return context;
}

/**
 * Manual orientation lock:
 * - UI stays visually in the current "app orientation" even if the device rotates.
 * - A bottom button appears when device orientation differs.
 * - Only tapping the button updates the app orientation.
 */
export function OrientationProvider({
  children,
  debounceMs = 400,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const getCurrentDeviceOrientation = useCallback((): 'portrait' | 'landscape' => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }, []);

  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>(() => getCurrentDeviceOrientation());
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => getCurrentDeviceOrientation());

  // Keep body from scrolling when we counter-rotate the app shell.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Detect device orientation changes (debounced)
  useEffect(() => {
    let timeoutId: number | null = null;

    const onViewportChange = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setDeviceOrientation(getCurrentDeviceOrientation());
      }, debounceMs);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [debounceMs, getCurrentDeviceOrientation]);

  // Publish app orientation as a class/CSS var (useful for any CSS overrides elsewhere)
  useEffect(() => {
    document.documentElement.classList.remove('orientation-portrait', 'orientation-landscape');
    document.documentElement.classList.add(`orientation-${appOrientation}`);
    document.documentElement.style.setProperty('--current-orientation', appOrientation);
  }, [appOrientation]);

  const hasPendingRotation = deviceOrientation !== appOrientation;

  const applyRotation = useCallback(() => {
    setAppOrientation(deviceOrientation);
  }, [deviceOrientation]);

  const contextValue: OrientationContextType = {
    orientation: appOrientation,
    deviceOrientation,
    hasPendingRotation,
    applyRotation,
  };

  // IMPORTANT: When the device rotates but we are not "allowing" rotation yet,
  // we counter-rotate the app shell so the UI stays visually locked.
  const needsCounterRotation = hasPendingRotation;

  const shellStyle: React.CSSProperties = needsCounterRotation
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vh',
        height: '100vw',
        transformOrigin: 'top left',
        transform:
          deviceOrientation === 'landscape' && appOrientation === 'portrait'
            ? 'rotate(90deg) translateY(-100%)'
            : deviceOrientation === 'portrait' && appOrientation === 'landscape'
              ? 'rotate(-90deg) translateX(-100%)'
              : undefined,
        background: 'hsl(var(--background))',
        overflow: 'hidden',
      }
    : {
        minHeight: '100vh',
        width: '100vw',
        background: 'hsl(var(--background))',
        overflow: 'hidden',
      };

  return React.createElement(
    OrientationContext.Provider,
    { value: contextValue },
    React.createElement('div', { className: 'orientation-shell', style: shellStyle }, children),
    hasPendingRotation &&
      React.createElement(
        'button',
        {
          onClick: applyRotation,
          className:
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-full shadow-lg animate-fade-in touch-target',
          style: {
            backdropFilter: 'blur(8px)',
          },
        },
        React.createElement(RotateCcw, { className: 'w-4 h-4' }),
        React.createElement('span', { className: 'text-sm font-medium' }, 'Rotate')
      )
  );
}
