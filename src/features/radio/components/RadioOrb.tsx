import { forwardRef } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  dragging?: boolean;
}

/**
 * The home-screen radio control: a radio glyph sitting on a desaturated
 * BT logo plate. Shared by the docked slot and the free-floating overlay.
 */
export const RadioOrb = forwardRef<HTMLButtonElement, Props>(function RadioOrb(
  { active, dragging, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Blacktop Radio (hold and drag to move)"
      title="Blacktop Radio — hold and drag to move"
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'relative flex items-center justify-center rounded-lg border touch-none select-none transition-all',
        'w-11 h-11',
        active ? 'border-accent/70 bg-accent/15' : 'border-accent/30 bg-background',
        dragging && 'scale-110 shadow-glow',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-display font-black tracking-tighter text-accent/25 text-sm saturate-50"
      >
        <span className="-mr-[0.1em]">B</span>
        <span className="-ml-[0.1em]">T</span>
      </span>
      <Radio className={cn('relative w-5 h-5 text-accent', active && 'animate-pulse')} />
    </button>
  );
});
