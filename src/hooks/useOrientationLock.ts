import React, { createContext, useContext, useEffect, useState } from 'react';
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
    return 'portrait' as const;
  }
  return context.orientation;
}

export function useOrientationControl() {
  const context = useContext(OrientationContext);
  if (!context) {
    return {
      orientation: 'portrait' as const,
      deviceOrientation: 'portrait' as const,
      hasPendingRotation: false,
      applyRotation: () => {},
    };
  }
  return context;
}

export function OrientationProvider({ children, debounceMs = 300 }: { children: React.ReactNode; debounceMs?: number }) {
  // What orientation the app is currently showing
  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  // What orientation the device is actually in
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  // Listen for device rotation
  useEffect(() => {
    let timeoutId: number | null = null;

    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        setDeviceOrientation(newOrientation);
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [debounceMs]);

  const hasPendingRotation = deviceOrientation !== appOrientation;

  const applyRotation = () => {
    setAppOrientation(deviceOrientation);
  };

  const contextValue: OrientationContextType = {
    orientation: appOrientation,
    deviceOrientation,
    hasPendingRotation,
    applyRotation,
  };

  return React.createElement(
    OrientationContext.Provider,
    { value: contextValue },
    children,
    hasPendingRotation && React.createElement(
      'button',
      {
        onClick: applyRotation,
        className: 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-full shadow-lg animate-fade-in touch-target',
        style: { backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }
      },
      React.createElement(RotateCcw, { className: 'w-4 h-4' }),
      React.createElement('span', { className: 'text-sm font-medium' }, 'Rotate')
    )
  );
}
