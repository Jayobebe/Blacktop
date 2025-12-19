import { useEffect, useState } from 'react';

/**
 * Hook that provides debounced orientation detection with dead zone to prevent
 * rapid layout changes from small device movements.
 * 
 * Uses both a time delay and aspect ratio threshold for hysteresis.
 * The dead zone means the aspect ratio must exceed a threshold before switching.
 */
export function useOrientationLock(debounceMs: number = 500, deadZoneRatio: number = 0.15) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    let timeoutId: number | null = null;
    let lastOrientation = orientation;

    const getOrientationWithDeadZone = (currentOrientation: 'portrait' | 'landscape'): 'portrait' | 'landscape' | null => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / height;
      
      // Dead zone: only switch if aspect ratio is clearly past the threshold
      // For landscape: aspect ratio must be > 1 + deadZone (e.g., > 1.15)
      // For portrait: aspect ratio must be < 1 - deadZone (e.g., < 0.85)
      const landscapeThreshold = 1 + deadZoneRatio;
      const portraitThreshold = 1 - deadZoneRatio;
      
      if (currentOrientation === 'portrait') {
        // Currently portrait - only switch to landscape if clearly wider
        if (aspectRatio > landscapeThreshold) {
          return 'landscape';
        }
      } else {
        // Currently landscape - only switch to portrait if clearly taller
        if (aspectRatio < portraitThreshold) {
          return 'portrait';
        }
      }
      
      // Within dead zone - keep current orientation
      return null;
    };

    const checkOrientation = () => {
      const newOrientation = getOrientationWithDeadZone(lastOrientation);
      
      // Only trigger change if we're clearly in a new orientation (outside dead zone)
      if (newOrientation && newOrientation !== lastOrientation) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = window.setTimeout(() => {
          // Re-check after debounce to make sure it's stable
          const confirmedOrientation = getOrientationWithDeadZone(lastOrientation);
          if (confirmedOrientation && confirmedOrientation !== lastOrientation) {
            lastOrientation = confirmedOrientation;
            setOrientation(confirmedOrientation);
          }
        }, debounceMs);
      }
    };

    // Check on resize and orientation change events
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [debounceMs, deadZoneRatio, orientation]);

  return orientation;
}

/**
 * Component that applies a CSS class to the body based on orientation,
 * with debouncing to prevent rapid changes.
 */
export function OrientationProvider({ children, debounceMs = 500 }: { children: React.ReactNode; debounceMs?: number }) {
  const orientation = useOrientationLock(debounceMs);

  useEffect(() => {
    // Apply orientation class to document for CSS targeting
    document.documentElement.classList.remove('orientation-portrait', 'orientation-landscape');
    document.documentElement.classList.add(`orientation-${orientation}`);
    
    // Also set a CSS custom property
    document.documentElement.style.setProperty('--current-orientation', orientation);
  }, [orientation]);

  return children;
}
