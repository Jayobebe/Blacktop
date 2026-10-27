import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/features/settings';
import { useMapOverlay } from '@/features/map';
import { RadioOrb } from './RadioOrb';
import { useRadioPlayer } from '../hooks/useRadioPlayer';
import { openRadioOverlay } from '../hooks/useRadioOverlay';
import { useFloatingRadio, setFloatingRadio, dockRadio, setRadioCarry, useRadioCarry } from '../hooks/useFloatingRadio';

const DRAG_THRESHOLD = 6;
const SNAP_RADIUS_PX = 80;

function distanceToDock(clientX: number, clientY: number): number {
  const dock = document.querySelector('[data-radio-dock]');
  if (!dock) return Infinity;
  const rect = dock.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.hypot(clientX - cx, clientY - cy);
}

function setDockGlow(on: boolean) {
  const placeholder = document.querySelector('[data-radio-placeholder]');
  if (!placeholder) return;
  if (on) {
    // Drawn inside the slot's edge: Home's card clips anything outside it at the top right.
    placeholder.classList.add('ring-2', 'ring-inset', 'ring-accent/60', 'bg-accent/15', 'border-accent/60');
    placeholder.classList.remove('opacity-60', 'border-accent/25');
  } else {
    placeholder.classList.remove('ring-2', 'ring-inset', 'ring-accent/60', 'bg-accent/15', 'border-accent/60');
    placeholder.classList.add('opacity-60', 'border-accent/25');
  }
}

const place = (clientX: number, clientY: number) =>
  setFloatingRadio({
    x: Math.min(0.94, Math.max(0.06, clientX / window.innerWidth)),
    y: Math.min(0.94, Math.max(0.06, clientY / window.innerHeight)),
  });

/**
 * The free-floating radio button. Undocked, it stays wherever it was left on
 * every page; docked at the end of Home's tuner it's only there. The ride
 * screen and the map have radio buttons of their own, so it steps aside there. Dragging it near Home's slot makes the
 * slot glow; letting go within snapping distance docks it.
 *
 * Drags follow the finger from where it went down (phones often report no
 * per-event movement on touch, which stalled the old drag), and a drag that
 * pulls the button out of its Home slot carries straight on with the same
 * finger (`useRadioCarry`): the docked button is gone from under it.
 */
export function FloatingRadioLayer() {
  const { settings } = useSettings();
  const player = useRadioPlayer();
  const { docked, x, y } = useFloatingRadio();
  const carrying = useRadioCarry();
  const { isOpen: mapOpen } = useMapOverlay();
  const location = useLocation();
  const [dragging, setDragging] = useState(false);
  const [nearDock, setNearDock] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const follow = (clientX: number, clientY: number) => {
    place(clientX, clientY);
    const close = distanceToDock(clientX, clientY) < SNAP_RADIUS_PX;
    setNearDock(close);
    setDockGlow(close);
  };
  const letGo = (clientX: number, clientY: number) => {
    setDragging(false);
    setNearDock(false);
    setDockGlow(false);
    if (distanceToDock(clientX, clientY) < SNAP_RADIUS_PX) dockRadio();
  };

  // Carried out of the dock: follow that finger until it lifts.
  useEffect(() => {
    if (!carrying) return;
    setDragging(true);
    const onMove = (e: PointerEvent) => follow(e.clientX, e.clientY);
    const onUp = (e: PointerEvent) => {
      setRadioCarry(false);
      letGo(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrying]);

  const ownButtons = mapOpen || location.pathname.startsWith('/ride');
  // Docked, it lives in Home's dock only (floating on other pages at the spot it was dropped by the dock read
  // as a button left behind); dragged out, it floats everywhere but the ride screen and the map.
  const hidden = !settings.radioEnabled || ownButtons || docked;
  if (hidden) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* the drag still follows without capture */
    }
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    if (!moved.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < DRAG_THRESHOLD) return;
    moved.current = true;
    setDragging(true);
    follow(e.clientX, e.clientY);
  };

  const finish = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* never captured */
    }
    start.current = null;
    if (!moved.current) return;
    letGo(e.clientX, e.clientY);
  };

  const onClick = () => {
    if (moved.current) { moved.current = false; return; }
    openRadioOverlay();
  };

  return createPortal(
    <div
      className="fixed z-[85] -translate-x-1/2 -translate-y-1/2"
      // Wherever it was left, it stays inside the safe area: under the notch or on the home bar it couldn't be pressed.
      style={{
        left: `clamp(calc(var(--safe-left) + 2rem), ${x * 100}%, calc(100% - var(--safe-right) - 2rem))`,
        top: `clamp(calc(var(--safe-top) + 2rem), ${y * 100}%, calc(100% - var(--safe-bottom) - 2rem))`,
      }}
    >
      <RadioOrb
        active={player.isPlaying}
        dragging={dragging}
        nearHome={nearDock}
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
