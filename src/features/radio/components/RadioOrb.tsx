import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { RadioFace } from './RadioFace';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  dragging?: boolean;
  nearHome?: boolean;
}

/**
 * The home-screen radio control (docked at the end of Home's tuner, or floating):
 * the same face as every radio button (RadioFace). Shared by the dock and the
 * free-floating overlay.
 */
export const RadioOrb = forwardRef<HTMLButtonElement, Props>(function RadioOrb(
  { active, dragging, nearHome, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={tr("Blacktop Radio (hold and drag to move)")}
      title={tr("Blacktop Radio — hold and drag to move")}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'relative rounded-2xl touch-none select-none transition-transform',
        // The tuner strip's height: the two sit in Home's header together.
        'w-12 h-12',
        dragging && 'scale-110 shadow-glow',
        nearHome && 'ring-2 ring-accent/60',
        className,
      )}
      {...rest}
    >
      <RadioFace playing={!!active} className="absolute inset-0" />
    </button>
  );
});
