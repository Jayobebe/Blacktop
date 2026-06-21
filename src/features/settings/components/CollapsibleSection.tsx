import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  icon?: LucideIcon;
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  delayClass?: string;
  labelClassName?: string;
  iconClassName?: string;
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
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        'bg-card/50 rounded-2xl border border-border/30 animate-slide-up overflow-hidden',
        open && 'col-span-2',
        delayClass,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-4 landscape:p-3 touch-target text-left"
      >
        {Icon && <Icon className={cn('w-4 h-4 text-muted-foreground', iconClassName)} />}
        <p
          className={cn(
            'text-[10px] text-muted-foreground uppercase tracking-widest flex-1',
            labelClassName,
          )}
        >
          {label}
        </p>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 landscape:px-3 landscape:pb-3 -mt-1">{children}</div>
      )}
    </section>
  );
}
