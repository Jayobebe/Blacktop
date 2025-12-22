import { useState, useEffect, useRef, useCallback } from 'react';

interface LeanAngleState {
  currentLean: number; // Degrees, positive = right, negative = left
  maxLeanLeft: number; // Max lean to the left (positive value)
  maxLeanRight: number; // Max lean to the right (positive value)
  isSupported: boolean;
  permissionGranted: boolean;
}

const SMOOTHING_FACTOR = 0.3; // Lower = smoother, higher = more responsive

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

  // Request permission for iOS 13+
  const requestPermission = useCallback(async () => {
    // Check if DeviceOrientationEvent is available
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[LeanAngle] DeviceOrientationEvent not supported');
      return false;
    }

    // iOS 13+ requires permission
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

    // Android and older iOS don't need permission
    setState(prev => ({ ...prev, permissionGranted: true, isSupported: true }));
    return true;
  }, []);

  // Reset max values (call when starting a new ride)
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

  useEffect(() => {
    if (!isActive) return;

    // Check support
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[LeanAngle] Not supported on this device');
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event;
      
      if (beta === null || gamma === null) return;

      // Convert to radians for accurate calculation
      const betaRad = (beta * Math.PI) / 180;
      const gammaRad = (gamma * Math.PI) / 180;
      
      // Calculate true lean angle using proper trigonometry
      // When device is upright, we need to project gamma onto the horizontal plane
      // This accounts for the non-linear relationship between gamma and actual lean
      
      let leanAngle: number;
      
      // Calculate the effective lean based on device orientation
      // Using atan2 for proper angle calculation accounting for beta
      const absBeta = Math.abs(beta);
      
      if (absBeta > 45 && absBeta < 135) {
        // Device is upright (facing rider)
        // Calculate the true roll angle by accounting for pitch (beta)
        // When beta = 90, cos(beta - 90) = cos(0) = 1, so lean = gamma
        // When beta deviates, we scale accordingly
        const pitchFromUpright = Math.abs(beta - 90) * (Math.PI / 180);
        const correctionFactor = Math.cos(pitchFromUpright);
        
        // Apply correction - gamma is less reliable as device tilts away from 90°
        leanAngle = gamma * correctionFactor;
        
        // Also account for gamma singularity near ±90° beta
        if (beta > 90) {
          leanAngle = -leanAngle;
        }
      } else {
        // Device is more horizontal (flat)
        leanAngle = gamma;
      }
      
      // Clamp to reasonable range (-60 to 60 degrees)
      leanAngle = Math.max(-60, Math.min(60, leanAngle));

      // Apply smoothing
      smoothedLean.current = smoothedLean.current + SMOOTHING_FACTOR * (leanAngle - smoothedLean.current);
      
      const currentLean = Math.round(smoothedLean.current);
      
      // Track max lean angles
      if (currentLean < 0) {
        // Leaning left
        const leftAngle = Math.abs(currentLean);
        if (leftAngle > maxLeanLeftRef.current) {
          maxLeanLeftRef.current = leftAngle;
        }
      } else if (currentLean > 0) {
        // Leaning right
        if (currentLean > maxLeanRightRef.current) {
          maxLeanRightRef.current = currentLean;
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

  // Get the absolute max lean (whichever side was higher)
  const maxLean = Math.max(state.maxLeanLeft, state.maxLeanRight);

  return {
    ...state,
    maxLean,
    requestPermission,
    resetMax,
  };
}
