import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeDeckSlide {
  key: string;
  node: ReactNode;
}

interface SwipeDeckProps {
  slides: SwipeDeckSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  /** No swiping at all (e.g. while riding or being guided). */
  locked?: boolean;
  className?: string;
}

/**
 * A horizontal deck of full-width cards, swiped with a finger (or dragged
 * with a mouse). Loops: past the last card comes the first, and back.
 *
 * The gesture only claims clearly sideways drags, so vertical scrolling,
 * pull-to-refresh and long-presses inside the cards keep working, and a
 * swipe never counts as a tap on whatever it started on.
 */
export function SwipeDeck({ slides, index, onIndexChange, locked = false, className }: SwipeDeckProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; axis: 'x' | 'y' | null; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const count = slides.length;

  const place = (dx: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    track.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`;
  };

  useLayoutEffect(() => {
    place(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  // Locking mid-drag drops the drag.
  useEffect(() => {
    if (locked && drag.current) {
      drag.current = null;
      place(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked || count < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      d.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (d.axis === 'y') {
        drag.current = null;
        return;
      }
      try {
        rootRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    }
    d.dx = dx;
    place(dx, false);
  };

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.axis !== 'x') return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const width = rootRef.current?.clientWidth || 1;
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.t); // px/ms
    const go = !cancelled && (Math.abs(d.dx) > width * 0.22 || (speed > 0.5 && Math.abs(d.dx) > 30));
    if (!go) {
      place(0, true);
      return;
    }
    const next = d.dx < 0 ? (index + 1) % count : (index - 1 + count) % count;
    if (next === index) place(0, true);
    else onIndexChange(next);
  };

  return (
    <div
      ref={rootRef}
      className={cn('relative overflow-hidden', className)}
      style={{ touchAction: locked ? 'auto' : 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      // The deck never scrolls itself (cards slide by transform). If anything
      // scrolls it from code (focus, scrollIntoView), put it straight back so
      // the cards can't drift out of line.
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollLeft || el.scrollTop) {
          el.scrollLeft = 0;
          el.scrollTop = 0;
        }
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div ref={trackRef} className="flex h-full w-full will-change-transform">
        {slides.map((s, i) => (
          <div
            key={s.key}
            className="w-full h-full shrink-0 min-w-0 flex flex-col"
            aria-hidden={i !== index}
            // Off-screen cards stay out of the tab order (React 18's types don't know `inert`).
            {...(i !== index ? ({ inert: '' } as Record<string, string>) : {})}
          >
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pagination pips for a SwipeDeck: a dot per card, the current one stretched into a pill. */
export function SwipeDeckPips({
  count,
  index,
  onSelect,
  labels,
  className,
}: {
  count: number;
  index: number;
  onSelect: (i: number) => void;
  labels?: string[];
  className?: string;
}) {
  if (count < 2) return null;
  return (
    <div className={cn('flex items-center justify-center gap-1.5', className)} role="tablist">
      {Array.from({ length: count }, (_, i) => {
        const active = i === index;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={labels?.[i]}
            onClick={() => onSelect(i)}
            className="tall-hit p-1.5 -m-0.5"
          >
            <span
              className={cn(
                'block h-1.5 rounded-full transition-all duration-300',
                active ? 'w-4 bg-accent' : 'w-1.5 bg-muted-foreground/40',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
