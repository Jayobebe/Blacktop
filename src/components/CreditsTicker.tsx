import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Glide speed, px a second: the pace of Home's tuner. */
const SPEED = 30;
/** Room between one copy and the next while gliding. */
const GAP = 32;

/**
 * One line of credits (the map's corner, OpenStreetMap and the rest) that never bleeds off the
 * screen: shown still and centred while it fits, and once it doesn't (a narrow phone, a search
 * credit added) gliding sideways at the tuner's pace in a seamless loop, its left and right
 * edges faded. A CSS animation (`.credits-tick`), so the compositor runs it; it stands still
 * under Thermal mode and reduced motion (the faded edges stay). Links in it stay tappable.
 */
export function CreditsTicker({ children, className }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const b = box.current;
    const l = line.current;
    if (!b || !l) return;
    const measure = () => {
      const over = l.scrollWidth > b.clientWidth + 1;
      setShift(over ? l.scrollWidth + GAP : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(l);
    return () => ro.disconnect();
  }, []);

  const ticking = shift > 0;
  return (
    <div
      ref={box}
      className={`${className ?? ''} overflow-hidden whitespace-nowrap ${ticking ? 'credits-fade !text-left' : ''}`}
    >
      <div
        className={ticking ? 'credits-tick inline-flex' : 'inline-flex'}
        style={ticking ? ({ '--credits-shift': `${shift}px`, animationDuration: `${shift / SPEED}s` } as React.CSSProperties) : undefined}
      >
        <span ref={line} className="inline-block">{children}</span>
        {/* The second copy carries the loop round; it's for the eye only. */}
        {ticking && <span className="inline-block" style={{ paddingLeft: GAP }} aria-hidden {...{ inert: "" }}>{children}</span>}
      </div>
    </div>
  );
}
