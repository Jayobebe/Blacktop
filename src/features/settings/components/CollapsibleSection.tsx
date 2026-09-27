import { useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
  /** Short value shown on the tile (e.g. "On"). */
  status?: ReactNode;
  /** One line under the title inside the panel. */
  description?: ReactNode;
  onHeaderClick?: () => void;
}

/**
 * A compact Settings tile. Tapping opens the section in a frosted panel that
 * slides up from the bottom, so the grid never reflows (no half-empty rows)
 * and the page stays short. Action tiles (`onHeaderClick`) just run the action.
 */
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
  description,
  onHeaderClick,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        type="button"
        aria-haspopup={onHeaderClick ? undefined : 'dialog'}
        onClick={() => {
          haptics.tick();
          if (onHeaderClick) onHeaderClick();
          else setOpen(true);
        }}
        className={cn(
          'pressable group relative bg-card rounded-[20px] border border-white/[0.06] p-3.5 text-left animate-slide-up',
          'flex flex-col justify-between gap-3 min-h-[92px] landscape:min-h-[76px]',
          delayClass,
          className,
        )}
      >
        <div className="flex items-start justify-between w-full">
          {Icon && (
            <span className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center shrink-0">
              <Icon className={cn('w-[18px] h-[18px] text-foreground/85', iconClassName)} strokeWidth={1.9} />
            </span>
          )}
          {rightElement ??
            (status ? (
              <span className="text-[12px] text-muted-foreground mt-1">{status}</span>
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground/70 mt-1 transition-transform group-hover:translate-x-0.5" />
            ))}
        </div>
        <p className={cn('text-[15px] font-medium leading-tight text-foreground', labelClassName)}>{label}</p>
      </button>

      {!onHeaderClick && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-[28px] max-h-[88dvh] overflow-y-auto safe-bottom px-5 pt-5 pb-6">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="flex items-center gap-2.5 text-[19px]">
                {Icon && (
                  <span className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                    <Icon className={cn('w-[18px] h-[18px]', iconClassName)} strokeWidth={1.9} />
                  </span>
                )}
                <span className={labelClassName}>{label}</span>
              </SheetTitle>
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">{label} settings</SheetDescription>
              )}
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
