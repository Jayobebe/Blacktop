import { useEffect, useRef } from 'react';
import { isThermal } from '@/lib/thermal';
import { cn } from '@/lib/utils';

/** The crawl, in pixels a second, and how fast a row may be thrown. */
const CRAWL = 16;
const MAX = 900;

/**
 * A row of the vault that crawls sideways on its own. It only moves when it
 * has somewhere to go (more than one card, wider than the screen), bounces at
 * each end, and stops while off screen or the page is hidden.
 *
 * The rider's finger sets its pace: the row is an ordinary scroller, so a drag
 * or a flick moves it as any list does, and once that settles the row carries
 * on at the speed and in the direction it was left, easing back to its crawl.
 * `paused` (a card has been lifted out of it) brings it to a stop.
 */
export function VaultCarousel({ count, paused, className, children }: { count: number; paused: boolean; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stop = useRef(paused);
  stop.current = paused;

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 2 || isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    let pos = el.scrollLeft;
    let vel = CRAWL;
    let dir = 1;
    // What this loop last wrote, to tell its own scrolling from the rider's.
    let wrote = -1;
    let touching = false;
    let userAt = -1e9;
    let seenAt = 0;
    let seenPos = el.scrollLeft;
    let visible = true;

    const onScroll = () => {
      if (Math.abs(el.scrollLeft - wrote) < 1.5) return;
      const now = performance.now();
      const dt = now - seenAt;
      // The rider's own pace, smoothed over the last few events.
      if (dt > 0 && dt < 120) vel = vel * 0.5 + (((el.scrollLeft - seenPos) / dt) * 1000) * 0.5;
      seenAt = now;
      seenPos = el.scrollLeft;
      userAt = now;
      pos = el.scrollLeft;
    };
    const down = () => {
      touching = true;
      seenAt = performance.now();
      seenPos = el.scrollLeft;
    };
    const up = () => {
      touching = false;
      userAt = performance.now();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return;
      // While a finger is down, or the list is still coasting from one, it's the rider's.
      if (touching || now - userAt < 140) return;
      vel = Math.max(-MAX, Math.min(MAX, vel));
      if (Math.abs(vel) > CRAWL * 1.5) dir = Math.sign(vel);
      // Back towards the crawl (or to a stop), quickly from a throw, gently near the end.
      const target = stop.current ? 0 : CRAWL * dir;
      vel += (target - vel) * Math.min(1, dt * (stop.current ? 5 : 1.6));
      if (Math.abs(vel) < 0.4 && stop.current) return;
      pos += vel * dt;
      if (pos <= 0) {
        pos = 0;
        dir = 1;
        vel = Math.abs(vel);
      } else if (pos >= max) {
        pos = max;
        dir = -1;
        vel = -Math.abs(vel);
      }
      wrote = pos;
      el.scrollLeft = pos;
    };

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    window.addEventListener('pointercancel', up, { passive: true });
    raf = requestAnimationFrame((t) => {
      last = t;
      raf = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [count]);

  return (
    <div ref={ref} className={cn('flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)} data-no-pull>
      {children}
    </div>
  );
}
