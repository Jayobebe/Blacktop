import React from 'react';

/**
 * Simple passthrough provider - no rotation logic.
 */
export function OrientationProvider({ children }: { children: React.ReactNode; debounceMs?: number }) {
  return React.createElement(React.Fragment, null, children);
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
