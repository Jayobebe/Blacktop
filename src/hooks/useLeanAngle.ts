import { useState, useEffect, useRef, useCallback } from 'react';

interface LeanAngleState {
  currentLean: number; // Degrees, positive = right, negative = left
  maxLeanLeft: number; // Max lean to the left (positive value)
  maxLeanRight: number; // Max lean to the right (positive value)
  isSupported: boolean;
  permissionGranted: boolean;
}

const SMOOTHING_FACTOR = 0.3; // Lower = smoother, higher = more responsive

// Get current screen orientation angle (0, 90, -90, 180)
function getScreenOrientationAngle(): number {
  // Modern API
  if (screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle;
  }
  // Legacy fallback (window.orientation is deprecated but still works on many devices)
  if (typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
}

export function useLeanAngle(isActive: boolean = false) {
  const [state, setState] = useState<LeanAngleState>({
    currentLean: 0,
    maxLeanLeft: 0,
    maxLeanRight: 0,
    isSupported: false,
    permissionGranted: false,
  });

  const smoothedLean = useRef(0);
  const maxLeanLeftRef = useRef(0);
  const maxLeanRightRef = useRef(0);
  const orientationAngleRef = useRef(getScreenOrientationAngle());

  // Request permission for iOS 13+
  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[LeanAngle] DeviceOrientationEvent not supported');
      return false;
    }

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setState(prev => ({ ...prev, permissionGranted: true, isSupported: true }));
          return true;
        }
        console.log('[LeanAngle] Permission denied');
        return false;
      } catch (err) {
        console.error('[LeanAngle] Permission request failed:', err);
        return false;
      }
    }

    setState(prev => ({ ...prev, permissionGranted: true, isSupported: true }));
    return true;
  }, []);

  // Reset max values
  const resetMax = useCallback(() => {
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    smoothedLean.current = 0;
    setState(prev => ({
      ...prev,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
    }));
  }, []);

  // Track screen orientation changes
  useEffect(() => {
    const updateOrientation = () => {
      orientationAngleRef.current = getScreenOrientationAngle();
      // Reset smoothing when orientation changes to avoid jumps
      smoothedLean.current = 0;
      console.log('[LeanAngle] Orientation changed:', orientationAngleRef.current);
    };

    if (screen.orientation) {
      screen.orientation.addEventListener('change', updateOrientation);
    }
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', updateOrientation);
      }
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[LeanAngle] Not supported on this device');
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma } = event;
      
      if (beta === null || gamma === null) return;

      const screenAngle = orientationAngleRef.current;
      
      // The goal: calculate the "roll" of the device as if screen is facing the user
      // This represents the motorcycle's lean angle
      //
      // Device orientation axes (when screen faces you in portrait):
      // - beta: pitch (tilt forward/back), 0 = vertical, 90 = flat on back
      // - gamma: roll (tilt left/right), -90 to 90
      //
      // When screen is rotated to landscape, the physical axes stay the same
      // but what WE perceive as "lean" changes:
      // - Portrait: lean = gamma (tilt left/right)
      // - Landscape-left (90°): lean = beta (but inverted)
      // - Landscape-right (270°/-90°): lean = -beta
      
      let rawLean: number;
      let isScreenFacingUser: boolean;
      
      // Determine if screen is approximately facing the user (not laying flat)
      // In portrait: beta should be roughly 45-135° (screen upright or slightly tilted)
      // In landscape: gamma should be roughly -45 to 45° (not tilted sideways too much)
      
      if (screenAngle === 0 || screenAngle === 180) {
        // Portrait orientation
        // Screen facing user when beta is roughly 45-135
        isScreenFacingUser = Math.abs(beta) > 30 && Math.abs(beta) < 150;
        
        if (isScreenFacingUser) {
          // Gamma is the roll (lean left/right)
          rawLean = gamma;
          
          // If phone is upside-down portrait (beta > 90), gamma direction flips
          if (beta > 90) {
            rawLean = -gamma;
          }
          
          // If screen is rotated 180° (upside-down), flip again
          if (screenAngle === 180) {
            rawLean = -rawLean;
          }
        } else {
          // Screen is too flat - can't reliably measure lean
          rawLean = 0;
        }
      } else {
        // Landscape orientation (90° or 270°/-90°)
        // Screen facing user when the device isn't tilted too far forward/back
        // In landscape, beta now represents what was gamma's role
        isScreenFacingUser = Math.abs(gamma) < 60;
        
        if (isScreenFacingUser) {
          // In landscape, beta represents the lean
          // But we need to account for gamma (how much the screen is tilted toward/away from user)
          
          if (screenAngle === 90) {
            // Landscape-left: home button on right (iOS) or rotated CCW
            // When bike leans right, beta decreases (becomes more negative)
            rawLean = -beta;
          } else {
            // Landscape-right (270° or -90°): home button on left or rotated CW  
            // When bike leans right, beta increases
            rawLean = beta;
          }
          
          // Apply correction for gamma (screen tilt toward/away from user)
          // When gamma is near ±90, we're losing accuracy
          const gammaCorrection = Math.cos((gamma * Math.PI) / 180);
          rawLean = rawLean * Math.abs(gammaCorrection);
        } else {
          // Screen is tilted too much sideways - can't reliably measure
          rawLean = 0;
        }
      }
      
      // Clamp to reasonable range (-60 to 60 degrees)
      rawLean = Math.max(-60, Math.min(60, rawLean));

      // Apply smoothing
      smoothedLean.current = smoothedLean.current + SMOOTHING_FACTOR * (rawLean - smoothedLean.current);
      
      const currentLean = Math.round(smoothedLean.current);
      
      // Track max lean angles (only when screen is facing user)
      if (isScreenFacingUser) {
        if (currentLean < 0) {
          const leftAngle = Math.abs(currentLean);
          if (leftAngle > maxLeanLeftRef.current) {
            maxLeanLeftRef.current = leftAngle;
          }
        } else if (currentLean > 0) {
          if (currentLean > maxLeanRightRef.current) {
            maxLeanRightRef.current = currentLean;
          }
        }
      }

      setState(prev => ({
        ...prev,
        currentLean,
        maxLeanLeft: maxLeanLeftRef.current,
        maxLeanRight: maxLeanRightRef.current,
        permissionGranted: true,
      }));
    };

    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [isActive]);

  const maxLean = Math.max(state.maxLeanLeft, state.maxLeanRight);

  return {
    ...state,
    maxLean,
    requestPermission,
    resetMax,
  };
}
