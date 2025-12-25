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
  // Legacy fallback
  if (typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
}

// Check if device is in landscape mode
function isLandscape(): boolean {
  const angle = getScreenOrientationAngle();
  return Math.abs(angle) === 90 || angle === 270;
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

  // Track screen orientation changes
  useEffect(() => {
    const updateOrientation = () => {
      orientationAngleRef.current = getScreenOrientationAngle();
      console.log('[LeanAngle] Orientation changed:', orientationAngleRef.current);
    };

    // Modern API
    if (screen.orientation) {
      screen.orientation.addEventListener('change', updateOrientation);
    }
    // Legacy fallback
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

    // Check support
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[LeanAngle] Not supported on this device');
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event;
      
      if (beta === null || gamma === null) return;

      const screenAngle = orientationAngleRef.current;
      
      let leanAngle: number;
      
      // Adjust for screen orientation
      // In portrait (0°): gamma is lean, beta is pitch
      // In landscape-left (90°): beta becomes lean (inverted), gamma becomes pitch
      // In landscape-right (-90° or 270°): beta becomes lean, gamma becomes pitch
      
      if (screenAngle === 90) {
        // Landscape left (home button on right for iOS, or rotated left)
        // In this orientation, beta represents the roll/lean
        // Device upright facing user: beta ≈ 0 when flat in this orientation
        const absBeta = Math.abs(beta);
        
        if (absBeta < 45 || absBeta > 135) {
          // Device is more horizontal in landscape - use beta directly
          leanAngle = -beta; // Invert for correct left/right
        } else {
          // Device upright in landscape - beta is lean
          leanAngle = -beta;
        }
      } else if (screenAngle === -90 || screenAngle === 270) {
        // Landscape right (home button on left for iOS, or rotated right)
        // Beta represents roll but opposite direction
        const absBeta = Math.abs(beta);
        
        if (absBeta < 45 || absBeta > 135) {
          leanAngle = beta;
        } else {
          leanAngle = beta;
        }
      } else {
        // Portrait mode (0° or 180°) - original logic
        // Convert to radians for accurate calculation
        const betaRad = (beta * Math.PI) / 180;
        const gammaRad = (gamma * Math.PI) / 180;
        
        // Calculate the effective lean based on device orientation
        const absBeta = Math.abs(beta);
        
        if (absBeta > 45 && absBeta < 135) {
          // Device is upright (facing rider)
          const pitchFromUpright = Math.abs(beta - 90) * (Math.PI / 180);
          const correctionFactor = Math.cos(pitchFromUpright);
          
          leanAngle = gamma * correctionFactor;
          
          if (beta > 90) {
            leanAngle = -leanAngle;
          }
        } else {
          // Device is more horizontal (flat)
          leanAngle = gamma;
        }
        
        // Handle upside-down portrait
        if (screenAngle === 180) {
          leanAngle = -leanAngle;
        }
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
