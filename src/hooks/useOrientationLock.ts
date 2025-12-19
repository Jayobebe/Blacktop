import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
    // Fallback for when used outside provider
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
 * Component that manages orientation with manual rotation control.
 * The app orientation only changes when the user explicitly approves it.
 */
export function OrientationProvider({ children, debounceMs = 400 }: { children: React.ReactNode; debounceMs?: number }) {
  // The orientation the app is currently displaying
  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });
  
  // The actual device orientation
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  // Detect device orientation changes
  useEffect(() => {
    let timeoutId: number | null = null;

    const checkDeviceOrientation = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = window.setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const newOrientation = width > height ? 'landscape' : 'portrait';
        setDeviceOrientation(newOrientation);
      }, debounceMs);
    };

    window.addEventListener('resize', checkDeviceOrientation);
    window.addEventListener('orientationchange', checkDeviceOrientation);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', checkDeviceOrientation);
      window.removeEventListener('orientationchange', checkDeviceOrientation);
    };
  }, [debounceMs]);

  // Apply orientation class to document
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

  return React.createElement(
    OrientationContext.Provider,
    { value: contextValue },
    children,
    hasPendingRotation && React.createElement(
      'button',
      {
        onClick: applyRotation,
        className: 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-full shadow-lg animate-fade-in touch-target',
        style: { 
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }
      },
      React.createElement(RotateCcw, { className: 'w-4 h-4' }),
      React.createElement('span', { className: 'text-sm font-medium' }, 'Rotate')
    )
  );
}
