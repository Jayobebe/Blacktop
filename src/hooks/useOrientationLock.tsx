import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSettings, OrientationLock } from '@/features/settings';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
  isLocked: boolean;
  lockMode: OrientationLock;
  toggleLock: () => void;
  lockOrientation: () => void;
  unlockOrientation: () => void;
  setLockMode: (mode: OrientationLock) => void;
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
  return {
    orientation: ctx?.orientation ?? ('portrait' as const),
    isLocked: ctx?.isLocked ?? false,
    lockMode: ctx?.lockMode ?? ('portrait' as OrientationLock),
    toggleLock: ctx?.toggleLock ?? (() => {}),
    lockOrientation: ctx?.lockOrientation ?? (() => {}),
    unlockOrientation: ctx?.unlockOrientation ?? (() => {}),
    setLockMode: ctx?.setLockMode ?? (() => {}),
  };
}

export function OrientationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { settings, updateSetting } = useSettings();
  const lockMode = settings.orientationLock;
  
  // Determine initial orientation based on lock mode
  const getInitialOrientation = (): 'portrait' | 'landscape' => {
    if (lockMode === 'auto') return getOrientationFromDimensions();
    return lockMode;
  };
  
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(getInitialOrientation);
  const isLocked = lockMode !== 'auto';
  const lastConfirmedOrientation = useRef(orientation);
  const isLockedRef = useRef(isLocked);
  
  // Keep ref in sync for use in event handlers
  isLockedRef.current = isLocked;

  // Update orientation when lock mode changes
  useEffect(() => {
    if (lockMode === 'portrait' || lockMode === 'landscape') {
      setOrientation(lockMode);
      lastConfirmedOrientation.current = lockMode;
      
      // Try to use the Screen Orientation API if available
      try {
        const screenOrientation = screen.orientation as any;
        if (screenOrientation?.lock) {
          screenOrientation.lock(lockMode).catch(() => {
            console.log('[OrientationLock] Native lock not available, using software lock');
          });
        }
      } catch {
        // Screen orientation lock not supported
      }
    } else {
      // Auto mode - unlock and set current orientation
      try {
        const screenOrientation = screen.orientation as any;
        if (screenOrientation?.unlock) {
          screenOrientation.unlock();
        }
      } catch {
        // Screen orientation unlock not supported
      }
      setOrientation(getOrientationFromDimensions());
    }
  }, [lockMode]);

  const setLockMode = useCallback((mode: OrientationLock) => {
    updateSetting('orientationLock', mode);
  }, [updateSetting]);

  const lockOrientation = useCallback(() => {
    // Lock to current orientation
    const current = getOrientationFromDimensions();
    setLockMode(current);
  }, [setLockMode]);

  const unlockOrientation = useCallback(() => {
    setLockMode('auto');
  }, [setLockMode]);

  const toggleLock = useCallback(() => {
    if (isLockedRef.current) {
      unlockOrientation();
    } else {
      lockOrientation();
    }
  }, [lockOrientation, unlockOrientation]);

  useEffect(() => {
    // If locked, don't respond to orientation changes
    if (isLocked) return;

    // Check if DeviceOrientationEvent is available
    const hasDeviceOrientation = 'DeviceOrientationEvent' in window;
    
    if (!hasDeviceOrientation) {
      // Fallback: use resize/orientationchange but with hysteresis
      let pendingOrientation: 'portrait' | 'landscape' | null = null;
      let confirmTimer: number | null = null;
      
      const onViewportChange = () => {
        if (isLockedRef.current) return;
        
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
            if (!isLockedRef.current && pendingOrientation && getOrientationFromDimensions() === pendingOrientation) {
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
      if (isLockedRef.current) return;
      
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
  }, [isLocked]);

  useEffect(() => {
    document.documentElement.classList.remove('app-portrait', 'app-landscape');
    document.documentElement.classList.add(`app-${orientation}`);
  }, [orientation]);

  const ctxValue = useMemo<OrientationContextType>(
    () => ({ orientation, isLocked, lockMode, toggleLock, lockOrientation, unlockOrientation, setLockMode }),
    [orientation, isLocked, lockMode, toggleLock, lockOrientation, unlockOrientation, setLockMode]
  );

  return (
    <OrientationContext.Provider value={ctxValue}>
      {children}
    </OrientationContext.Provider>
  );
}
