import { useRef } from 'react';
import { useSettings } from '@/features/settings';
import { RadioOrb } from './RadioOrb';
import { useRadioPlayer } from '../hooks/useRadioPlayer';
import { openRadioOverlay } from '../hooks/useRadioOverlay';
import { useFloatingRadio, undockRadio } from '../hooks/useFloatingRadio';

const DRAG_THRESHOLD = 10;

/**
 * The home header slot. Tap opens the radio overlay; press-and-drag pops the
 * button out into the free-floating overlay. While floating, the slot stays as
 * a drop target so the button can be snapped back into place.
 */
export function HomeRadioDock() {
  const { settings } = useSettings();
  const player = useRadioPlayer();
  const { docked } = useFloatingRadio();
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  if (!settings.radioEnabled) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved.current = true;
    start.current = null;
    undockRadio(
      Math.min(0.94, Math.max(0.06, e.clientX / window.innerWidth)),
      Math.min(0.94, Math.max(0.06, e.clientY / window.innerHeight)),
    );
  };

  const onPointerUp = () => { start.current = null; };

  const onClick = () => {
    if (moved.current) { moved.current = false; return; }
    openRadioOverlay();
  };

  return (
    <div data-radio-dock className="flex items-center justify-center w-11 h-11">
      {docked ? (
        <RadioOrb
          active={player.isPlaying}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onClick}
        />
      ) : (
        <div
          aria-hidden
          className="w-11 h-11 rounded-lg border border-dashed border-accent/25 opacity-60"
        />
      )}
    </div>
  );
}
