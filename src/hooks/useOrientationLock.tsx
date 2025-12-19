import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OrientationContextType {
  orientation: 'portrait' | 'landscape';
  deviceOrientation: 'portrait' | 'landscape';
  hasPendingRotation: boolean;
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

function RotationTray({
  isOpen,
  onToggle,
  onRotate,
  hasPending,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onRotate: () => void;
  hasPending: boolean;
}) {
  return (
    <div
      className={cn(
        'fixed left-0 top-1/2 -translate-y-1/2 z-[9999] flex items-center transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Tray content */}
      <div className="bg-card border border-border rounded-r-xl shadow-lg p-3 pr-8 flex flex-col gap-2">
        <Button
          onClick={onRotate}
          size="sm"
          variant={hasPending ? 'default' : 'secondary'}
          className={cn(
            "h-10 px-3 rounded-lg touch-target transition-shadow duration-300",
            isOpen && hasPending && "shadow-[0_0_20px_hsl(var(--accent)/0.6)]"
          )}
          disabled={!hasPending}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Rotate
        </Button>
        {hasPending && (
          <p className="text-[10px] text-muted-foreground text-center">
            Tap to rotate
          </p>
        )}
      </div>

      {/* Tab handle */}
      <button
        onClick={onToggle}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 translate-x-full',
          'w-6 h-12 bg-card border border-l-0 border-border rounded-r-lg',
          'flex items-center justify-center',
          'hover:bg-secondary transition-colors',
          hasPending && 'border-accent bg-accent/10'
        )}
        aria-label={isOpen ? 'Close rotation tray' : 'Open rotation tray'}
      >
        <ChevronRight
          className={cn(
            'w-3 h-3 transition-transform duration-300',
            isOpen && 'rotate-180',
            hasPending && 'text-accent'
          )}
        />
      </button>
    </div>
  );
}

export function OrientationProvider({
  children,
  debounceMs = 250,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => inferOrientation());
  const [appOrientation, setAppOrientation] = useState<'portrait' | 'landscape'>(() => inferOrientation());
  const [trayOpen, setTrayOpen] = useState(false);

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

  useEffect(() => {
    document.documentElement.classList.remove('app-portrait', 'app-landscape');
    document.documentElement.classList.add(`app-${appOrientation}`);
  }, [appOrientation]);

  const hasPendingRotation = deviceOrientation !== appOrientation;

  const applyRotation = useCallback(() => {
    setAppOrientation(deviceOrientation);
    setTrayOpen(false);
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
      <RotationTray
        isOpen={trayOpen}
        onToggle={() => setTrayOpen((o) => !o)}
        onRotate={applyRotation}
        hasPending={hasPendingRotation}
      />
    </OrientationContext.Provider>
  );
}
