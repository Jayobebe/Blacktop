import { useRef } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { useRadioPlayer, toggle } from '../hooks/useRadioPlayer';
import { openRadioOverlay } from '../hooks/useRadioOverlay';

interface Props {
  /** Ride = large circular control; map = slim toolbar square. */
  variant?: 'ride' | 'map';
  className?: string;
}

const HOLD_MS = 450;

/**
 * Tap toggles play/pause (or opens the dial when nothing is loaded);
 * press-and-hold always forces the radio overlay open.
 */
export function RadioButton({ variant = 'ride', className }: Props) {
  const { settings } = useSettings();
  const player = useRadioPlayer();
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  if (!settings.radioEnabled) return null;

  const startHold = () => {
    heldRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      openRadioOverlay();
    }, HOLD_MS);
  };

  const endHold = () => {
    if (holdTimer.current != null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const handleClick = () => {
    if (heldRef.current) { heldRef.current = false; return; }
    if (!player.stationId) { openRadioOverlay(); return; }
    void toggle();
  };

  const active = player.isPlaying;

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleClick}
      aria-label={active ? 'Pause radio (hold for stations)' : 'Blacktop Radio (hold for stations)'}
      title="Blacktop Radio — hold for stations"
      className={cn(
        variant === 'ride'
          ? 'h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-full flex items-center justify-center transition-all touch-target'
          : 'w-9 h-9 flex items-center justify-center transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : variant === 'ride'
            ? 'bg-secondary hover:bg-muted'
            : 'text-foreground/80 hover:bg-secondary',
        className,
      )}
    >
      <Radio className={cn(variant === 'ride' ? 'w-7 h-7 landscape:w-8 landscape:h-8' : 'w-4 h-4', active && 'animate-pulse')} />
    </button>
  );
}
