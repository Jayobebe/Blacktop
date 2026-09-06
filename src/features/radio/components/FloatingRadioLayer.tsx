import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/features/settings';
import { useMapOverlay } from '@/features/map';
import { RadioOrb } from './RadioOrb';
import { useRadioPlayer } from '../hooks/useRadioPlayer';
import { openRadioOverlay } from '../hooks/useRadioOverlay';
import { useFloatingRadio, setFloatingRadio, dockRadio } from '../hooks/useFloatingRadio';

const DRAG_THRESHOLD = 6;

/**
 * The free-floating radio button. Persists across pages once undocked, but is
 * hidden on the active ride screen and while the Blacktop Maps overlay is open.
 * Dropping it on the home header slot snaps it back into place.
 */
export function FloatingRadioLayer() {
  const { settings } = useSettings();
  const player = useRadioPlayer();
  const { docked, x, y } = useFloatingRadio();
  const { isOpen: mapOpen } = useMapOverlay();
  const location = useLocation();
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);

  const hidden = !settings.radioEnabled || docked || mapOpen || location.pathname.startsWith('/ride');
  if (hidden) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const dx = Math.abs(e.movementX ?? 0);
    const dy = Math.abs(e.movementY ?? 0);
    if (!moved.current && dx + dy < DRAG_THRESHOLD) return;
    moved.current = true;
    setDragging(true);
    setFloatingRadio({
      x: Math.min(0.94, Math.max(0.06, e.clientX / window.innerWidth)),
      y: Math.min(0.94, Math.max(0.06, e.clientY / window.innerHeight)),
    });
  };

  const finish = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragging(false);
    if (!moved.current) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under?.closest('[data-radio-dock]')) dockRadio();
  };

  const onClick = () => {
    if (moved.current) { moved.current = false; return; }
    openRadioOverlay();
  };

  return createPortal(
    <div
      className="fixed z-[85] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <RadioOrb
        active={player.isPlaying}
        dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClick={onClick}
        className="shadow-lg backdrop-blur"
      />
    </div>,
    document.body,
  );
}
