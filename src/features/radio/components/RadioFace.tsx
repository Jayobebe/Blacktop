import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoadedStation } from '../hooks/useLoadedStation';
import { stationHsl } from '../lib/stationVisuals';
import { EqBars } from './EqBars';

/**
 * What every radio button shows (Home's dock, the floating button, the ride
 * screen, the map's toolbar): with nothing loaded, the radio glyph (in the
 * second accent, the border in the main one) on a dark tile; with a station loaded, equaliser bars in its colour, moving while it
 * plays and still while paused, and a red dot for a live stream.
 */
export function RadioFace({ playing, small, className }: { playing: boolean; small?: boolean; className?: string }) {
  const station = useLoadedStation();
  const hsl = station ? stationHsl(station.color) : null;
  return (
    <span
      aria-hidden
      className={cn('flex items-center justify-center rounded-[inherit] border', !hsl && 'border-accent/35 bg-card/60 text-accent-2', className)}
      style={hsl ? { backgroundColor: `hsl(${hsl} / ${playing ? 0.2 : 0.1})`, borderColor: `hsl(${hsl} / ${playing ? 0.9 : 0.45})`, color: `hsl(${hsl})` } : undefined}
    >
      {hsl ? <EqBars playing={playing} className={small ? 'text-[14px]' : 'text-[20px]'} /> : <Radio className={small ? 'w-4 h-4' : 'w-5 h-5'} />}
      {station?.streamUrl && playing && <span className={cn('absolute rounded-full bg-destructive', small ? 'top-1 right-1 w-1.5 h-1.5' : 'top-1.5 right-1.5 w-2 h-2')} />}
    </span>
  );
}
