import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { useRadioPlayer, toggle } from '../hooks/useRadioPlayer';
import { openRadioOverlay } from '../hooks/useRadioOverlay';
import { tr } from '@/lib/i18n';
import { RadioFace } from './RadioFace';

interface Props {
  /** Ride = the large control; map = the slim toolbar square. */
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
      data-tip="radio"
      aria-label={active ? tr("Pause radio (hold for stations)") : tr("Blacktop Radio (hold for stations)")}
      title={tr("Blacktop Radio — hold for stations")}
      className={cn(
        'relative',
        variant === 'ride'
          ? 'h-14 w-14 landscape:h-16 landscape:w-16 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12 rounded-2xl touch-target'
          : 'w-9 h-9 rounded-none hover:bg-secondary',
        className,
      )}
    >
      {/* The same face as every radio button: bars in the station's colour once one is loaded. */}
      <RadioFace playing={active} small={variant === 'map'} plain={variant === 'map'} className={cn('absolute inset-0', variant === 'map' && 'border-0')} />
    </button>
  );
}
