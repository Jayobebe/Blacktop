import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrientationContextType {
  /** The orientation the app has "accepted" (ONLY changes on button press). */
  orientation: 'portrait' | 'landscape';
  /** The current device/viewport orientation (changes when phone rotates). */
  deviceOrientation: 'portrait' | 'landscape';
  /** True when device orientation differs from accepted app orientation. */
  hasPendingRotation: boolean;
  /** Accept the pending rotation (sets orientation = deviceOrientation). */
  applyRotation: () => void;
}

const OrientationContext = createContext<OrientationContextType | null>(null);

function inferOrientation(): 'portrait' | 'landscape' {
  if (typeof window === 'undefined') return 'portrait';
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export function useOrientationLock() {
  const ctx = useContext(OrientationContext);
  return ctx?.orientation ?? ('portrait' as const);
}

export function useOrientationControl() {
  const ctx = useContext(OrientationContext);
  return (
    ctx ?? {
      orientation: 'portrait' as const,
      deviceOrientation: 'portrait' as const,
      hasPendingRotation: false,
      applyRotation: () => {},
    }
  );
}

/**
 * Manual orientation controller.
 * - Rotating the phone ONLY shows a blocking overlay + button.
 * - Underlying app may rotate with the viewport, but it is hidden and non-interactive.
 * - Only pressing the button dismisses the overlay and "accepts" the rotation.
 */
export function OrientationProvider({
  children,
  debounceMs = 250,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => inferOrientation());
  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>(() => inferOrientation());

  useEffect(() => {
    let t: number | null = null;

    const onViewportChange = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        setDeviceOrientation(inferOrientation());
      }, debounceMs);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [debounceMs]);

  // Expose the accepted app orientation via class (can be used for CSS targeting later).
  useEffect(() => {
    document.documentElement.classList.remove('app-portrait', 'app-landscape');
    document.documentElement.classList.add(`app-${appOrientation}`);
  }, [appOrientation]);

  const hasPendingRotation = deviceOrientation !== appOrientation;

  const applyRotation = useCallback(() => {
    setAppOrientation(deviceOrientation);
  }, [deviceOrientation]);

  const ctxValue = useMemo<OrientationContextType>(
    () => ({
      orientation: appOrientation,
      deviceOrientation,
      hasPendingRotation,
      applyRotation,
    }),
    [appOrientation, deviceOrientation, hasPendingRotation, applyRotation]
  );

  return (
    <OrientationContext.Provider value={ctxValue}>
      {children}

      {hasPendingRotation && (
        <div
          className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Rotate screen"
        >
          <div className="flex-1 flex items-center justify-center px-6 text-center">
            <div className="max-w-sm animate-fade-in">
              <p className="text-sm text-muted-foreground">Rotation is locked.</p>
              <h2 className="mt-1 text-lg font-display font-bold">Press Rotate to continue</h2>
            </div>
          </div>

          <div className="p-4 safe-bottom">
            <Button
              onClick={applyRotation}
              className="w-full h-12 rounded-full touch-target"
            >
              <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
              Rotate
            </Button>
          </div>
        </div>
      )}
    </OrientationContext.Provider>
  );
}
