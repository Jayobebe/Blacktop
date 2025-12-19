import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
}

const OrientationContext = createContext<OrientationContextType | null>(null);

// Threshold in degrees - device must tilt past this angle to trigger rotation
const ROTATION_THRESHOLD = 80;

function getOrientationFromDimensions(): 'portrait' | 'landscape' {
  if (typeof window === 'undefined') return 'portrait';
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export function useOrientationLock() {
  const ctx = useContext(OrientationContext);
  return ctx?.orientation ?? ('portrait' as const);
}

export function OrientationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => getOrientationFromDimensions());
  const lastConfirmedOrientation = useRef(orientation);

  useEffect(() => {
    // Check if DeviceOrientationEvent is available
    const hasDeviceOrientation = 'DeviceOrientationEvent' in window;
    
    if (!hasDeviceOrientation) {
      // Fallback: use resize/orientationchange but with hysteresis
      let pendingOrientation: 'portrait' | 'landscape' | null = null;
      let confirmTimer: number | null = null;
      
      const onViewportChange = () => {
        const newOrientation = getOrientationFromDimensions();
        
        if (newOrientation !== lastConfirmedOrientation.current) {
          if (pendingOrientation === newOrientation) {
            // Already pending, wait for timer
            return;
          }
          
          pendingOrientation = newOrientation;
          
          if (confirmTimer) window.clearTimeout(confirmTimer);
          
          // Require orientation to be stable for 500ms before confirming
          confirmTimer = window.setTimeout(() => {
            if (pendingOrientation && getOrientationFromDimensions() === pendingOrientation) {
              lastConfirmedOrientation.current = pendingOrientation;
              setOrientation(pendingOrientation);
            }
            pendingOrientation = null;
          }, 500);
        }
      };

      window.addEventListener('resize', onViewportChange);
      window.addEventListener('orientationchange', onViewportChange);

      return () => {
        if (confirmTimer) window.clearTimeout(confirmTimer);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('orientationchange', onViewportChange);
      };
    }

    // Use DeviceOrientation API for precise angle detection
    let stableOrientation: 'portrait' | 'landscape' = lastConfirmedOrientation.current;
    let stableStartTime: number | null = null;
    const STABLE_DURATION = 300; // ms orientation must be stable

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const gamma = event.gamma ?? 0; // Left/right tilt (-90 to 90)
      const beta = event.beta ?? 0;   // Front/back tilt (-180 to 180)
      
      // Calculate the effective tilt angle from vertical
      // gamma: 0 = upright, ±90 = fully sideways
      const absGamma = Math.abs(gamma);
      
      // Determine target orientation based on tilt angle
      let targetOrientation: 'portrait' | 'landscape';
      
      if (absGamma >= ROTATION_THRESHOLD) {
        // Device is tilted more than threshold degrees - landscape
        targetOrientation = 'landscape';
      } else if (absGamma <= (90 - ROTATION_THRESHOLD)) {
        // Device is within threshold of vertical - portrait
        targetOrientation = 'portrait';
      } else {
        // In the dead zone - keep current orientation
        return;
      }

      // Check if orientation has been stable
      if (targetOrientation !== stableOrientation) {
        stableOrientation = targetOrientation;
        stableStartTime = Date.now();
      } else if (stableStartTime && Date.now() - stableStartTime >= STABLE_DURATION) {
        // Orientation has been stable long enough
        if (targetOrientation !== lastConfirmedOrientation.current) {
          lastConfirmedOrientation.current = targetOrientation;
          setOrientation(targetOrientation);
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
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
