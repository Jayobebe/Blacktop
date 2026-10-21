import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The highlight of a segmented selector (Month / Week, Racer / Pit crew), as
 * one pill that slides to whichever option is chosen instead of jumping. Put
 * it first inside the selector's row (made `relative`); it finds the chosen
 * option among its siblings by `aria-selected`, `aria-checked` or
 * `aria-pressed`. The options draw no background of their own when chosen,
 * only the text colour, and sit above it (`relative z-[1]`). The first
 * placement doesn't slide; nothing slides under Thermal mode or less motion.
 */
export function SlidingPill({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const pill = ref.current;
    const row = pill?.parentElement;
    if (!pill || !row) return;
    let placed = false;
    const place = () => {
      const on = Array.from(row.children).find(
        (c) => c !== pill && (c.getAttribute('aria-selected') === 'true' || c.getAttribute('aria-checked') === 'true' || c.getAttribute('aria-pressed') === 'true'),
      ) as HTMLElement | undefined;
      if (!on) {
        pill.style.opacity = '0';
        return;
      }
      pill.style.transition = placed ? '' : 'none';
      pill.style.opacity = '1';
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.height = `${on.offsetHeight}px`;
      pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      if (!placed) {
        void pill.offsetWidth;
        placed = true;
        pill.style.transition = '';
      }
    };
    place();
    const mo = new MutationObserver(place);
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed'] });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(row);
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        'absolute left-0 top-0 rounded-lg bg-accent pointer-events-none transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        className,
      )}
      style={{ opacity: 0 }}
    />
  );
}
