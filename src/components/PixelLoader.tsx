import { cn } from '@/lib/utils';

/**
 * Blacktop's loading mark, in place of a spinning wheel: a little square of
 * pixels breaking up and coming back together, the page warp's pixels at
 * button size. A wave runs corner to corner, each block fading and shrinking as
 * it passes, the way the held warp breathes while a page loads. Sized and
 * coloured like an icon (`className="w-4 h-4 text-accent"`, it draws in the
 * current colour). Pure CSS (`.pixel-loader` in index.css): still under Thermal
 * mode and reduced motion, where it shows the whole square, dimmed.
 */
const N = 4;
const CELLS = Array.from({ length: N * N }, (_, i) => ({ x: i % N, y: Math.floor(i / N) }));

export function PixelLoader({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${N} ${N}`} className={cn('pixel-loader w-4 h-4 shrink-0', className)} aria-hidden="true" focusable="false">
      {CELLS.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x + 0.08}
          y={y + 0.08}
          width={0.84}
          height={0.84}
          fill="currentColor"
          // Corner to corner, with a little scatter so it reads as pixels, not a stripe.
          style={{ animationDelay: `${((x + y) * 90 + ((x * 7 + y * 3) % 4) * 25) - 900}ms`, transformOrigin: `${x + 0.5}px ${y + 0.5}px` }}
        />
      ))}
    </svg>
  );
}
