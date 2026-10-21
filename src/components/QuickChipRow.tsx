import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** One quick search: the map's place categories, and card drops. */
export interface QuickChip {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** A shorter name for the chip ("24h"); `label` is still what it's called aloud. */
  short?: string;
  /** Its colour; none (card drops) takes the accent. */
  color: string;
}

/** The most the row shows before its "+N" (the rest open on a tap): the owner's four. */
const MOST = 4;

const LOOK = {
  /** The map: small tiles under the search bar, so four and "+N" fit beside the map's own buttons. */
  compact: {
    row: 'flex gap-1.5',
    chip: 'flex-shrink-0 min-w-[3.25rem] flex flex-col items-center justify-center gap-0.5 py-1.5 px-1.5 rounded-xl border shadow-lg backdrop-blur transition-all active:scale-95',
    off: 'bg-card/95 border-border hover:bg-muted',
    label: 'text-[11px] font-medium leading-tight whitespace-nowrap',
  },
  /** The lobbies: tiles with the icon over the name. */
  tile: {
    row: 'flex gap-1.5 -mx-1 px-1',
    chip: 'flex-shrink-0 min-w-[4rem] snap-start flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border transition-all active:scale-95',
    off: 'bg-card border-border hover:bg-muted',
    label: 'text-xs font-medium whitespace-nowrap',
  },
} as const;

/**
 * A row of quick searches that never runs off the screen: as many as fit (up
 * to four, in the order given) and a "+N" button that opens the rest as one
 * row to scroll sideways, with Less at its end. What fits is measured from the
 * chips themselves (a hidden copy of the whole row), so it follows the screen,
 * the language and the order. A lit chip past the fit keeps the row open, so
 * it can always be tapped off. `resetKey` closes the row when it changes;
 * `className` goes on the row's box (to hide it, say).
 */
export function QuickChipRow<T extends QuickChip>({
  items,
  active,
  onPick,
  look,
  className,
  resetKey,
}: {
  items: T[];
  active: string | null;
  onPick: (item: T) => void;
  look: keyof typeof LOOK;
  className?: string;
  resetKey?: unknown;
}) {
  const L = LOOK[look];
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(Math.min(MOST, items.length));
  const [open, setOpen] = useState(false);
  /** Scrolled to the far end (no fade there, so the last chip reads clearly). */
  const [atEnd, setAtEnd] = useState(false);
  const names = items.map((i) => `${i.id}:${i.label}`).join('|');

  useEffect(() => setOpen(false), [resetKey]);

  // How many fit beside the "+N": measured off the hidden copy, again whenever the room or the names change.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const copy = measureRef.current;
    const row = rowRef.current;
    if (!box || !copy || !row) return;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const room = box.clientWidth;
      const kids = [...copy.children] as HTMLElement[];
      const more = kids.pop();
      const widths = kids.map((k) => k.offsetWidth);
      const all = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0);
      if (all <= room) {
        setFit(widths.length);
        return;
      }
      let used = more?.offsetWidth ?? 0;
      let n = 0;
      for (const w of widths) {
        if (n === MOST || used + gap + w > room) break;
        used += gap + w;
        n++;
      }
      setFit(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [names, look]);

  const lit = items.findIndex((i) => i.id === active);
  const showAll = open || fit >= items.length || lit >= fit;
  const shown = showAll ? items : items.slice(0, fit);
  const hidden = items.length - shown.length;

  // Opening scrolls the first of the rest into view: that's what was asked for.
  const expand = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      const row = rowRef.current;
      const first = row?.children[fit] as HTMLElement | undefined;
      if (!row || !first) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('thermal');
      row.scrollTo({ left: Math.max(0, first.offsetLeft - row.offsetLeft - 4), behavior: reduce ? 'auto' : 'smooth' });
    });
  };
  const collapse = () => {
    setOpen(false);
    rowRef.current?.scrollTo({ left: 0 });
  };
  const onScroll = () => {
    const row = rowRef.current;
    if (row) setAtEnd(row.scrollLeft + row.clientWidth >= row.scrollWidth - 2);
  };

  const chip = (item: T, interactive: boolean) => {
    const on = item.id === active;
    const style: CSSProperties | undefined = on && item.color ? { background: item.color } : undefined;
    const cls = cn(L.chip, on ? (item.color ? 'text-white border-transparent' : 'bg-accent text-accent-foreground border-accent') : L.off);
    const inner = (
      <>
        <item.Icon className={cn('w-4 h-4', !on && !item.color && 'text-accent')} style={!on && item.color ? { color: item.color } : undefined} />
        <span className={L.label}>{item.short ?? item.label}</span>
      </>
    );
    return interactive ? (
      <button key={item.id} type="button" data-chip={item.id} onClick={() => onPick(item)} aria-pressed={on} aria-label={item.short ? item.label : undefined} className={cls} style={style}>
        {inner}
      </button>
    ) : (
      <span key={item.id} className={cls} style={style}>
        {inner}
      </span>
    );
  };
  // "+N" and Less: as small as their words, so the row keeps its room for the searches.
  const extra = cn(L.chip, L.off, 'justify-center text-muted-foreground text-xs font-medium', look === 'tile' ? 'min-w-[2.75rem] px-2.5' : 'min-w-[2.5rem] px-2');

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {/* The whole row, unseen and clipped to nothing: what's measured. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-0 overflow-hidden invisible pointer-events-none">
        <div ref={measureRef} className={cn(L.row, 'w-max')}>
          {items.map((i) => chip(i, false))}
          <span className={extra}>+{items.length}</span>
        </div>
      </div>
      <div
        ref={rowRef}
        onScroll={onScroll}
        className={cn(
          L.row,
          'overflow-x-auto scrollbar-hide pointer-events-auto',
          look === 'compact' ? 'w-fit max-w-full' : 'snap-x',
          // Open and running on past the edge: the edge fades, so it reads as a row that scrolls.
          hidden === 0 && fit < items.length && !atEnd && '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]',
        )}
      >
        {shown.map((i) => chip(i, true))}
        {hidden > 0 && (
          <button type="button" onClick={expand} aria-expanded={false} aria-label={tr("Show {0} more", [hidden])} className={cn(extra, 'font-semibold')}>
            +{hidden}
          </button>
        )}
        {open && lit < fit && (
          <button type="button" onClick={collapse} aria-expanded className={extra}>
            {tr("Less")}
          </button>
        )}
      </div>
    </div>
  );
}
