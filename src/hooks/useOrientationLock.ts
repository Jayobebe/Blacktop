import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface OrientationContextType {
  /** The orientation the app is currently presenting (ONLY changes on button press). */
  orientation: 'portrait' | 'landscape';
  /** The device orientation inferred from viewport ratio (changes when device rotates). */
  deviceOrientation: 'portrait' | 'landscape';
  hasPendingRotation: boolean;
  applyRotation: () => void;
}

const OrientationContext = createContext<OrientationContextType | null>(null);

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

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.round((vv?.width ?? window.innerWidth) || 0),
    height: Math.round((vv?.height ?? window.innerHeight) || 0),
  };
}

function inferOrientation({ width, height }: { width: number; height: number }): 'portrait' | 'landscape' {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Manual rotation controller:
 * - Rotating the device ONLY shows the button.
 * - The UI stays visually locked via counter-rotation until you press the button.
 */
export function OrientationProvider({
  children,
  debounceMs = 250,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const [viewport, setViewport] = useState(() => ({ width: 0, height: 0 }));
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // App starts in whatever the current device orientation is; after that it only changes on button press.
  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial
    const initial = getViewportSize();
    setViewport(initial);
    const initialDevice = inferOrientation(initial);
    setDeviceOrientation(initialDevice);
    setAppOrientation(initialDevice);

    let t: number | null = null;

    const onViewportChange = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const next = getViewportSize();
        setViewport(next);
        setDeviceOrientation(inferOrientation(next));
      }, debounceMs);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);

    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, [debounceMs]);

  const hasPendingRotation = deviceOrientation !== appOrientation;

  const ctxValue = useMemo<OrientationContextType>(
    () => ({
      orientation: appOrientation,
      deviceOrientation,
      hasPendingRotation,
      applyRotation: () => setAppOrientation(deviceOrientation),
    }),
    [appOrientation, deviceOrientation, hasPendingRotation]
  );

  // Visual lock: when device rotates but app orientation hasn't been accepted,
  // we counter-rotate the whole app so it LOOKS like it never rotated.
  const vw = Math.max(1, viewport.width || window.innerWidth || 1);
  const vh = Math.max(1, viewport.height || window.innerHeight || 1);

  const shellStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    width: vw,
    height: vh,
    overflow: 'hidden',
    background: 'hsl(var(--background))',
  };

  let contentStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: vw,
    height: vh,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
  };

  if (hasPendingRotation) {
    // Keep the app visually locked to appOrientation by counter-rotating.
    // Device landscape but app portrait: rotate content -90° and shift into view.
    if (deviceOrientation === 'landscape' && appOrientation === 'portrait') {
      contentStyle = {
        position: 'absolute',
        top: 0,
        left: vw,
        width: vh,
        height: vw,
        transform: 'rotate(-90deg)',
        transformOrigin: 'top left',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
      };
    }

    // Device portrait but app landscape: rotate content +90° and shift into view.
    if (deviceOrientation === 'portrait' && appOrientation === 'landscape') {
      contentStyle = {
        position: 'absolute',
        top: vh,
        left: 0,
        width: vh,
        height: vw,
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
      };
    }
  }

  return React.createElement(
    OrientationContext.Provider,
    { value: ctxValue },
    React.createElement(
      'div',
      { style: shellStyle, className: 'orientation-shell' },
      React.createElement('div', { style: contentStyle, className: 'orientation-content' }, children)
    ),
    hasPendingRotation &&
      React.createElement(
        'button',
        {
          onClick: ctxValue.applyRotation,
          className:
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-full shadow-lg animate-fade-in touch-target',
          style: { backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' },
        },
        React.createElement(RotateCcw, { className: 'w-4 h-4', 'aria-hidden': true }),
        React.createElement('span', { className: 'text-sm font-medium' }, 'Rotate')
      )
  );
}
