import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { pixelCopy, drawPixels } from '@/lib/warp';

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
 *
 * The card being swiped away turns to pixels as it goes (the app's page
 * warp, `lib/warp`), coarser the further it's dragged, and is gone by the time
 * the next card is in; the card coming in arrives as coarse pixels and comes
 * out of them as it settles (its copy is taken by sliding the strip to it for
 * an instant, never painted). Let go short of a change and the card sharpens
 * back as it returns. Not under Thermal mode or less motion (`pixelCopy`
 * answers null).
 */
export function SwipeDeck({ slides, index, onIndexChange, locked = false, className }: SwipeDeckProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; axis: 'x' | 'y' | null; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const placed = useRef(false);
  const count = slides.length;
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pix = useRef<{
    canvas: HTMLCanvasElement;
    copy: HTMLCanvasElement;
    p: number;
    raf: number;
    /** The card coming in: which, its copy and the canvas over it. */
    inIdx: number;
    inCopy: HTMLCanvasElement | null;
    inCanvas: HTMLCanvasElement | null;
  } | null>(null);

  /** How far through it the swipe is (0 to 1): the copy shows over the card, coarser as it goes. */
  const drawPix = (p: number) => {
    const o = pix.current;
    if (!o) return;
    o.p = p;
    drawPixels(o.canvas, o.copy, 1 + 5 * p);
    o.canvas.style.opacity = String(Math.min(1, p * 3.5));
    if (o.inCanvas && o.inCopy) {
      // Coarse while it's far off, finer as it comes in, fading off the real card over the last stretch.
      drawPixels(o.inCanvas, o.inCopy, 1 + 5 * (1 - p));
      o.inCanvas.style.opacity = String(p < 0.6 ? 1 : Math.max(0, (1 - p) / 0.4));
    }
  };
  const dropPix = () => {
    const o = pix.current;
    if (!o) return;
    cancelAnimationFrame(o.raf);
    o.canvas.remove();
    o.inCanvas?.remove();
    pix.current = null;
  };
  /** A copy of card `to` as it will look in place: the strip slid to it for one layout read, put back before any paint. */
  const captureIn = (to: number) => {
    const o = pix.current;
    const root = rootRef.current;
    const track = trackRef.current;
    const slide = slideRefs.current[to];
    if (!o || !root || !track || !slide) return;
    o.inCanvas?.remove();
    o.inCanvas = null;
    o.inCopy = null;
    o.inIdx = to;
    const transform = track.style.transform;
    const transition = track.style.transition;
    track.style.transition = 'none';
    track.style.transform = `translate3d(${-to * 100}%, 0, 0)`;
    const copy = pixelCopy(root.getBoundingClientRect());
    track.style.transform = transform;
    track.style.transition = transition;
    if (!copy) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:60;image-rendering:pixelated;pointer-events:none';
    slide.appendChild(canvas);
    o.inCopy = copy;
    o.inCanvas = canvas;
  };
  const startPix = () => {
    dropPix();
    const root = rootRef.current;
    const slide = slideRefs.current[index];
    if (!root || !slide) return;
    const copy = pixelCopy(root.getBoundingClientRect());
    if (!copy) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:60;image-rendering:pixelated;pointer-events:none;opacity:0';
    slide.appendChild(canvas);
    pix.current = { canvas, copy, p: 0, raf: 0, inIdx: -1, inCopy: null, inCanvas: null };
  };
  /** After letting go: on to fully broken up (a change) or back to nothing (no change), with the slide's own 320 ms. */
  const settlePix = (to: 0 | 1) => {
    const o = pix.current;
    if (!o) return;
    const from = o.p;
    const start = performance.now();
    const step = (now: number) => {
      if (pix.current !== o) return;
      const t = Math.min(1, (now - start) / 320);
      const e = 1 - (1 - t) ** 3;
      drawPix(from + (to - from) * e);
      if (t < 1) o.raf = requestAnimationFrame(step);
      else dropPix();
    };
    o.raf = requestAnimationFrame(step);
  };
  useEffect(() => dropPix, []);

  const place = (dx: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    track.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`;
  };

  // The first placement is where the deck opens (Home is the second card, Console the first): no slide in to it.
  useLayoutEffect(() => {
    place(0, placed.current);
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  // Locking mid-drag drops the drag.
  useEffect(() => {
    if (locked && drag.current) {
      drag.current = null;
      place(0, true);
      dropPix();
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
      startPix();
    }
    d.dx = dx;
    if (pix.current && dx !== 0) {
      const to = dx < 0 ? (index + 1) % count : (index - 1 + count) % count;
      if (to !== index && pix.current.inIdx !== to) captureIn(to);
    }
    place(dx, false);
    drawPix(Math.min(1, Math.abs(dx) / (rootRef.current?.clientWidth || 1)));
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
      settlePix(0);
      return;
    }
    const next = d.dx < 0 ? (index + 1) % count : (index - 1 + count) % count;
    if (next === index) {
      place(0, true);
      settlePix(0);
    } else {
      settlePix(1);
      onIndexChange(next);
    }
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
            ref={(el) => (slideRefs.current[i] = el)}
            className="relative w-full h-full shrink-0 min-w-0 flex flex-col"
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
  marks,
  className,
}: {
  count: number;
  index: number;
  onSelect: (i: number) => void;
  labels?: string[];
  /** A card with something new on it (Blacktop Console's unseen notifications): its pip glows. */
  marks?: boolean[];
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
                active ? 'w-4 bg-accent' : marks?.[i] ? 'w-1.5 bg-accent ring-2 ring-accent/30' : 'w-1.5 bg-muted-foreground/40',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
