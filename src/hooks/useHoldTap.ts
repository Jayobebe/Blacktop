import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { haptics } from '@/lib/haptics';

/**
 * One button, two jobs: a tap does `onTap`, holding it for `ms` does `onHold`
 * (with a buzz as it fires) and the tap that would follow is swallowed.
 * `holding` is true while the finger is down, for a fill that shows the hold
 * coming. Give the button the `hold-target` class so a phone doesn't select
 * its lettering or cancel the hold.
 */
export function useHoldTap(onTap: () => void, onHold: () => void, ms = 1200) {
  const timer = useRef(0);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const holdRef = useRef(onHold);
  holdRef.current = onHold;

  const cancel = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => cancel, []);

  return {
    holding,
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        held.current = false;
        setHolding(true);
        timer.current = window.setTimeout(() => {
          held.current = true;
          setHolding(false);
          haptics.heavy();
          holdRef.current();
        }, ms);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
      onClick: () => {
        if (held.current) {
          held.current = false;
          return;
        }
        tapRef.current();
      },
    },
  };
}
