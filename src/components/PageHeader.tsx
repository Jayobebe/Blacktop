import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Route to go back to; defaults to browser history. Pass `false` for no back button. */
  backTo?: string | false;
  onBack?: () => void;
  backLabel?: string;
  /** Trailing actions (icon buttons, badges). */
  right?: ReactNode;
  /** Sticky translucent bar for long scrolling documents. */
  sticky?: boolean;
  className?: string;
}

/**
 * The one header every screen uses: circular back button, title with an
 * optional subtitle, and trailing actions. Keeps size, spacing and hit areas
 * identical app-wide.
 */
export function PageHeader({ title, subtitle, backTo, onBack, backLabel = 'Back', right, sticky, className }: PageHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => {
    haptics.tick();
    if (onBack) return onBack();
    if (typeof backTo === 'string') return navigate(backTo);
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  return (
    <header
      className={cn(
        'flex items-center gap-3 flex-shrink-0',
        sticky ? 'sticky top-0 z-20 -mx-4 px-4 py-3 bg-background/75 backdrop-blur-xl border-b border-white/[0.06] safe-top' : 'mb-4 landscape:mb-3',
        className
      )}
    >
      {backTo !== false && (
        <HeaderButton onClick={goBack} aria-label={backLabel}>
          <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
        </HeaderButton>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[22px] landscape:text-xl font-semibold tracking-[-0.025em] leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground leading-snug mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  );
}

/** Circular 40px icon button used in headers. */
export function HeaderButton({ className, children, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'pressable w-10 h-10 rounded-full flex items-center justify-center shrink-0',
        active ? 'bg-accent/15 text-accent' : 'bg-white/[0.07] text-foreground/85 hover:bg-white/[0.11]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
