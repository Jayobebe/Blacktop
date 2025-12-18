import { useEffect, useState } from 'react';

/**
 * Hook that provides debounced orientation detection to prevent
 * rapid layout changes from small device movements.
 * 
 * Uses a delay before confirming orientation change to add hysteresis.
 */
export function useOrientationLock(debounceMs: number = 500) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    let timeoutId: number | null = null;
    let lastOrientation = orientation;

    const checkOrientation = () => {
      const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      
      // Only trigger change after debounce if orientation actually changed
      if (newOrientation !== lastOrientation) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = window.setTimeout(() => {
          // Re-check after debounce to make sure it's stable
          const confirmedOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
          if (confirmedOrientation !== lastOrientation) {
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
  }, [debounceMs, orientation]);

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
