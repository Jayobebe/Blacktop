import { cn } from '@/lib/utils';

/**
 * Four equaliser bars in the current colour: moving while the radio plays,
 * held mid-height while it's paused. A simple animation, not the real sound
 * (cheap, and live streams can't be read). Still under Thermal mode and
 * reduced motion (`.eq-bars` in index.css).
 */
export function EqBars({ playing, className, style }: { playing: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span aria-hidden className={cn('eq-bars', playing && 'eq-bars-on', className)} style={style}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
