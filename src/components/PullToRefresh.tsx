import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { setBackdropPull, surgeBackdrop } from '@/lib/backdropMotion';

/**
 * App-wide pull-to-refresh. Dragging down from the top of any screen pulls the
 * backdrop with it: the wordmark rows follow the finger, the belts slow almost
 * to a stop and the fish-eye lens bulges. Let go past the threshold and the
 * belts surge while active queries refetch and `blacktop:refresh` fires on
 * window (for stores that aren't on react-query); otherwise it all springs back.
 *
 * Touch only. Skipped inside dialogs, sheets, form fields, maps, canvases and
 * anything marked `data-no-pull`, and when anything under the finger is
 * scrolled away from the top.
 */

/** Rubber band: the pull approaches this many px however far the finger goes. */
const MAX_PULL = 130;
/** Pull (after the rubber band) needed to refresh. */
const THRESHOLD = 72;
/** Keep the spinner up at least this long so a quick refresh still reads. */
const MIN_REFRESH_MS = 700;

const SKIP = '[role="dialog"], [role="alertdialog"], [data-vaul-drawer], [data-no-pull], input, textarea, select, [contenteditable="true"], .maplibregl-map, canvas';

const rubberBand = (dy: number) => MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)));

/** True when the target and every scrollable ancestor (and the page) are at the top. */
function atTop(target: Element | null): boolean {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') return false;
    }
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

export function PullToRefresh({ disabled = false }: { disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (disabled) return;
    let startX = 0;
    let startY = 0;
    let target: Element | null = null;
    let tracking = false; // finger down somewhere a pull could start
    let pulling = false; // committed to a downward pull
    let distance = 0;
    let armed = false;

    const reset = () => {
      tracking = pulling = armed = false;
      distance = 0;
      setPull(0);
      setBackdropPull(0, 0);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      target = e.target as Element | null;
      if (target?.closest?.(SKIP) || !atTop(target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Sideways swipes, upward scrolls or a list that's started scrolling: not a pull.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || !atTop(target)) {
          tracking = false;
          return;
        }
        pulling = true;
      }
      distance = rubberBand(Math.max(0, dy));
      const progress = Math.min(1, distance / THRESHOLD);
      if (progress >= 1 && !armed) haptics.light();
      armed = progress >= 1;
      setPull(distance);
      setBackdropPull(progress, distance);
    };

    const onEnd = async () => {
      if (!pulling) {
        tracking = false;
        return;
      }
      const go = armed;
      reset();
      if (!go) return;
      refreshingRef.current = true;
      setRefreshing(true);
      surgeBackdrop(30);
      window.dispatchEvent(new CustomEvent('blacktop:refresh'));
      const minWait = new Promise((r) => setTimeout(r, MIN_REFRESH_MS));
      try {
        await Promise.all([queryClient.refetchQueries({ type: 'active' }), minWait]);
      } catch {
        await minWait;
      }
      refreshingRef.current = false;
      setRefreshing(false);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
      reset();
    };
  }, [disabled, queryClient]);

  const progress = Math.min(1, pull / THRESHOLD);
  const visible = pull > 0 || refreshing;
  const y = refreshing ? THRESHOLD * 0.8 : pull * 0.8;

  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      aria-label={refreshing ? 'Refreshing' : undefined}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: 'calc(env(safe-area-inset-top) - 40px)' }}
    >
      <div
        className={cn(
          'frost-accent flex h-10 w-10 items-center justify-center rounded-full shadow-lg',
          pull === 0 && 'transition-[transform,opacity] duration-300 ease-out',
        )}
        style={{
          transform: `translateY(${visible ? y : 0}px) scale(${refreshing ? 1 : 0.6 + 0.4 * progress})`,
          opacity: visible ? Math.max(progress, refreshing ? 1 : 0) : 0,
        }}
      >
        <RefreshCw
          className={cn('h-4 w-4', refreshing && 'animate-spin')}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
