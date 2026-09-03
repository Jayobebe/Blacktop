import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onHeaderClick?: () => void;
}

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
  onHeaderClick,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isActionHeader = Boolean(onHeaderClick);

  return (
    <section
      className={cn(
        'glass-tile rounded-2xl animate-slide-up overflow-hidden',
        open && !isActionHeader && 'col-span-2',
        delayClass,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (onHeaderClick) {
            onHeaderClick();
            return;
          }
          setOpen((v) => !v);
        }}
        className="w-full flex items-center gap-2 px-4 landscape:px-3 h-14 landscape:h-12 text-left"
      >
        {Icon && <Icon className={cn('w-4 h-4 shrink-0 transition-colors', open ? 'text-accent' : 'text-[hsl(var(--chrome-text))]', iconClassName)} />}
        <p
          className={cn(
            'chrome-label flex-1 truncate',
            labelClassName,
          )}
        >
          {label}
        </p>
        {rightElement ? (
          <span className="shrink-0">{rightElement}</span>
        ) : (
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 transition-transform',
              open ? 'rotate-180 text-accent' : 'text-[hsl(var(--chrome-text))]',
            )}
          />
        )}
      </button>
      {!isActionHeader && open && children && (
        <div className="px-4 pb-4 landscape:px-3 landscape:pb-3 -mt-1">{children}</div>
      )}
    </section>
  );
}
