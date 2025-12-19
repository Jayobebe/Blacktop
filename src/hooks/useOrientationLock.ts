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

  // Track viewport dimensions for counter-rotation sizing
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

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
        setViewportSize({ width, height });
        const newOrientation = width > height ? 'landscape' : 'portrait';
        setDeviceOrientation(newOrientation);
      }, debounceMs);
    };

    // Initial size
    setViewportSize({ width: window.innerWidth, height: window.innerHeight });

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

  // Calculate counter-rotation styles when orientations don't match
  const needsCounterRotation = hasPendingRotation;
  
  let wrapperStyle: React.CSSProperties = {};
  
  if (needsCounterRotation) {
    // Device is in a different orientation than what app wants
    // We need to rotate the content to counter the device rotation
    const isDeviceLandscape = deviceOrientation === 'landscape';
    
    if (isDeviceLandscape && appOrientation === 'portrait') {
      // Device rotated to landscape, but app wants portrait
      // Rotate content -90deg and swap dimensions
      wrapperStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: viewportSize.height,
        height: viewportSize.width,
        transform: 'rotate(-90deg)',
        transformOrigin: 'top left',
        marginLeft: viewportSize.width,
        overflow: 'hidden',
      };
    } else if (!isDeviceLandscape && appOrientation === 'landscape') {
      // Device rotated to portrait, but app wants landscape
      // Rotate content 90deg and swap dimensions
      wrapperStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: viewportSize.height,
        height: viewportSize.width,
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
        marginTop: viewportSize.height,
        overflow: 'hidden',
      };
    }
  }

  return React.createElement(
    OrientationContext.Provider,
    { value: contextValue },
    React.createElement(
      'div',
      { 
        style: needsCounterRotation ? wrapperStyle : { minHeight: '100vh' },
        className: 'orientation-wrapper'
      },
      children
    ),
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
