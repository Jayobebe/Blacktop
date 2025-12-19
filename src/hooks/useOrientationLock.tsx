import React from 'react';

export function OrientationProvider({ children }: { children: React.ReactNode; debounceMs?: number }) {
  return <>{children}</>;
}

export function useOrientationLock() {
  return 'portrait' as const;
}

export function useOrientationControl() {
  return {
    orientation: 'portrait' as const,
    deviceOrientation: 'portrait' as const,
    hasPendingRotation: false,
    applyRotation: () => {},
  };
}
