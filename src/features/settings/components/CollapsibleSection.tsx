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
  /** Short value shown before the chevron (e.g. "On"), like a native settings row. */
  status?: ReactNode;
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
  status,
  onHeaderClick,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isActionHeader = Boolean(onHeaderClick);

  return (
    <section
      className={cn(
        'bg-card rounded-[20px] border border-white/[0.06] animate-slide-up overflow-hidden',
        delayClass,
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={isActionHeader ? undefined : open}
        onClick={() => {
          if (onHeaderClick) {
            onHeaderClick();
            return;
          }
          setOpen((v) => !v);
        }}
        className="pressable w-full flex items-center gap-3 px-4 landscape:px-3 h-[58px] landscape:h-12 text-left"
      >
        {Icon && (
          <span className="w-8 h-8 rounded-[10px] bg-white/[0.07] flex items-center justify-center shrink-0">
            <Icon className={cn('w-[17px] h-[17px] text-foreground/80', iconClassName)} strokeWidth={1.9} />
          </span>
        )}
        <p className={cn('text-[15px] font-medium text-foreground flex-1 truncate', labelClassName)}>{label}</p>
        {status && <span className="text-[14px] text-muted-foreground shrink-0">{status}</span>}
        {rightElement ? (
          <span className="shrink-0">{rightElement}</span>
        ) : (
          <ChevronDown
            className={cn(
              'w-[18px] h-[18px] text-muted-foreground transition-transform duration-300 ease-spring shrink-0',
              open && 'rotate-180',
            )}
          />
        )}
      </button>
      {!isActionHeader && children && (
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-spring', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          {/* inert while closed: hidden content must not take focus or be read out */}
          <div className="overflow-hidden" {...(!open ? { inert: '' as unknown as boolean } : {})}>
            <div className="px-4 pb-4 pt-1 landscape:px-3 landscape:pb-3 border-t border-white/[0.06]">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}
