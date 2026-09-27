import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface CollapsibleSectionProps {
  icon?: LucideIcon;
  label: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  delayClass?: string;
  labelClassName?: string;
  iconClassName?: string;
  rightElement?: ReactNode;
  /** On/off indicator shown as a small dot before the chevron (truthy = on). */
  status?: ReactNode;
  onHeaderClick?: () => void;
  /**
   * Position in a 2-column grid. When set, the tile never moves: its content
   * opens as a full-width panel placed directly under the tile's row (via CSS
   * `order`), so opening a section can't leave a half-empty row.
   * Without it, the section expands inline (full-width blocks).
   */
  index?: number;
}

/** Settings dropdown tile: accent icon, label, accent chevron; content drops down below. */
export function CollapsibleSection({
  icon: Icon,
  label,
  children,
  defaultOpen = false,
  className,
  delayClass,
  labelClassName,
  iconClassName,
  rightElement,
  status,
  onHeaderClick,
  index,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  // Grid panels leave the layout entirely once closed (an empty grid item would
  // still add a row gap); `shown` lags `open` so the close animation can play.
  const [shown, setShown] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(defaultOpen);
  useEffect(() => {
    if (open) {
      setShown(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(raf);
    }
    setExpanded(false);
    const t = window.setTimeout(() => setShown(false), 300);
    return () => window.clearTimeout(t);
  }, [open]);
  const isActionHeader = Boolean(onHeaderClick);
  const inGrid = index !== undefined;

  const header = (
    <button
      type="button"
      aria-expanded={isActionHeader ? undefined : open}
      onClick={() => {
        haptics.tick();
        if (onHeaderClick) {
          onHeaderClick();
          return;
        }
        setOpen((v) => !v);
      }}
      className="pressable w-full flex items-center gap-2 px-3 h-14 landscape:h-12 text-left"
    >
      {Icon && (
        <span className="relative shrink-0">
          <Icon className={cn('w-[17px] h-[17px] text-accent', iconClassName)} strokeWidth={1.9} />
          {/* On/off status as a dot on the icon's corner, so it never squeezes the label */}
          {status !== undefined && status !== null && status !== false && (
            <span
              className={cn(
                'absolute -top-0.5 -right-1 w-[7px] h-[7px] rounded-full ring-2 ring-card',
                status ? 'bg-emerald-400' : 'bg-muted-foreground/50',
              )}
              aria-label={typeof status === 'string' && status ? status : 'Off'}
            />
          )}
        </span>
      )}
      <p className={cn('text-[13px] font-medium tracking-[-0.01em] text-foreground flex-1 min-w-0 truncate', labelClassName)}>{label}</p>
      {rightElement ? (
        <span className="shrink-0">{rightElement}</span>
      ) : (
        <ChevronDown
          className={cn('w-4 h-4 text-accent transition-transform duration-300 ease-spring shrink-0', open && 'rotate-180')}
        />
      )}
    </button>
  );

  const body = !isActionHeader && children && (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-spring',
        (inGrid ? expanded : open) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      {/* inert while closed: hidden content must not take focus or be read out */}
      <div className="overflow-hidden" {...(!open ? { inert: '' as unknown as boolean } : {})}>
        <div className="px-4 pb-4 pt-3 landscape:px-3 landscape:pb-3">{children}</div>
      </div>
    </div>
  );

  const surface = 'bg-card rounded-[18px] border border-white/[0.06] animate-slide-up overflow-hidden';

  if (!inGrid) {
    return (
      <section className={cn(surface, delayClass, className)}>
        {header}
        {body && open && <div className="border-t border-white/[0.06]" />}
        {body}
      </section>
    );
  }

  // Grid mode: tile stays put; panel follows the tile's row (row = pair of indices).
  const rowEnd = index - (index % 2) + 1;
  return (
    <>
      <section
        style={{ order: index * 2 }}
        className={cn(surface, open && 'border-accent/40', delayClass, className)}
      >
        {header}
      </section>
      {body && shown && (
        <section
          style={{ order: rowEnd * 2 + 1 }}
          className={cn(
            'col-span-2 rounded-[18px] overflow-hidden transition-opacity duration-300',
            surface,
            'border-accent/30',
            expanded ? 'opacity-100' : 'opacity-0',
          )}
          aria-label={`${label} settings`}
        >
          {body}
        </section>
      )}
    </>
  );
}
