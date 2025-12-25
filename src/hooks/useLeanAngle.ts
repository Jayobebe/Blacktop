import { useState, useEffect, useRef, useCallback } from 'react';

interface LeanAngleState {
  currentLean: number; // Degrees, positive = right, negative = left (after calibration)
  rawLean: number; // Raw lean before calibration offset
  maxLeanLeft: number; // Max lean to the left (positive value)
  maxLeanRight: number; // Max lean to the right (positive value)
  isSupported: boolean;
  permissionGranted: boolean;
  isCalibrated: boolean; // Whether zero calibration has been applied
}

const SMOOTHING_FACTOR = 0.3;

function getScreenOrientationAngle(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle;
  }
  if (typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
}

export function useLeanAngle(isActive: boolean = false) {
  const [state, setState] = useState<LeanAngleState>({
    currentLean: 0,
    rawLean: 0,
    maxLeanLeft: 0,
    maxLeanRight: 0,
    isSupported: false,
    permissionGranted: false,
    isCalibrated: false,
  });

  const smoothedLean = useRef(0);
  const rawLeanRef = useRef(0); // Store raw lean for calibration
  const maxLeanLeftRef = useRef(0);
  const maxLeanRightRef = useRef(0);
  const orientationAngleRef = useRef(getScreenOrientationAngle());
  const calibrationOffsetRef = useRef(0); // Offset to subtract from raw readings

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

  // Zero/calibrate the sensor - sets current position as 0°
  const calibrate = useCallback(() => {
    calibrationOffsetRef.current = rawLeanRef.current;
    // Reset max values when calibrating
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    smoothedLean.current = 0;
    setState(prev => ({
      ...prev,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
      isCalibrated: true,
    }));
    console.log('[LeanAngle] Calibrated - offset set to:', calibrationOffsetRef.current);
  }, []);

  // Reset calibration and max values
  const resetMax = useCallback(() => {
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    smoothedLean.current = 0;
    // Note: Don't reset calibration offset here - user might want to keep it
    setState(prev => ({
      ...prev,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
    }));
  }, []);

  // Clear calibration offset completely
  const clearCalibration = useCallback(() => {
    calibrationOffsetRef.current = 0;
    maxLeanLeftRef.current = 0;
    maxLeanRightRef.current = 0;
    smoothedLean.current = 0;
    setState(prev => ({
      ...prev,
      currentLean: 0,
      maxLeanLeft: 0,
      maxLeanRight: 0,
      isCalibrated: false,
    }));
    console.log('[LeanAngle] Calibration cleared');
  }, []);

  // Track screen orientation changes
  useEffect(() => {
    const updateOrientation = () => {
      orientationAngleRef.current = getScreenOrientationAngle();
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
      
      let rawLean: number;
      let isScreenFacingUser: boolean;
      
      if (screenAngle === 0 || screenAngle === 180) {
        // Portrait orientation
        isScreenFacingUser = Math.abs(beta) > 30 && Math.abs(beta) < 150;
        
        if (isScreenFacingUser) {
          rawLean = gamma;
          if (beta > 90) {
            rawLean = -gamma;
          }
          if (screenAngle === 180) {
            rawLean = -rawLean;
          }
        } else {
          rawLean = 0;
        }
      } else {
        // Landscape orientation (90° or 270°/-90°)
        isScreenFacingUser = Math.abs(gamma) < 60;
        
        if (isScreenFacingUser) {
          if (screenAngle === 90) {
            rawLean = -beta;
          } else {
            rawLean = beta;
          }
          const gammaCorrection = Math.cos((gamma * Math.PI) / 180);
          rawLean = rawLean * Math.abs(gammaCorrection);
        } else {
          rawLean = 0;
        }
      }
      
      // Clamp raw lean
      rawLean = Math.max(-90, Math.min(90, rawLean));
      
      // Store raw lean for calibration reference
      rawLeanRef.current = rawLean;
      
      // Apply calibration offset
      let calibratedLean = rawLean - calibrationOffsetRef.current;
      
      // Clamp calibrated lean too
      calibratedLean = Math.max(-90, Math.min(90, calibratedLean));

      // Apply smoothing to calibrated value
      smoothedLean.current = smoothedLean.current + SMOOTHING_FACTOR * (calibratedLean - smoothedLean.current);
      
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
        rawLean: Math.round(rawLean),
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
    calibrate, // Zero the sensor at current position
    clearCalibration, // Remove calibration offset
  };
}
