import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { haptics } from '@/lib/haptics';

interface DemoTooltipProps {
  children: React.ReactNode;
  hint: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  pulse?: boolean;
  onInteract?: () => void;
  showArrow?: boolean;
  className?: string;
}

export function DemoTooltip({ 
  children, 
  hint, 
  position = 'bottom', 
  pulse = true,
  onInteract,
  showArrow = true,
  className
}: DemoTooltipProps) {
  const handleClick = () => {
    haptics.medium();
    onInteract?.();
  };

  return (
    <div className={cn("relative inline-block", className)} onClick={handleClick}>
      {/* Pulse ring effect */}
      {pulse && (
        <div className="absolute inset-0 rounded-xl">
          <div className="absolute inset-0 rounded-xl ring-2 ring-accent animate-ping opacity-75" />
          <div className="absolute inset-0 rounded-xl ring-2 ring-accent/50" />
        </div>
      )}
      
      {/* The interactive element */}
      <div className="relative z-10">
        {children}
      </div>
      
      {/* Tooltip hint */}
      <div className={cn(
        "absolute z-20 whitespace-nowrap bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg animate-bounce-subtle",
        position === 'bottom' && "top-full left-1/2 -translate-x-1/2 mt-2",
        position === 'top' && "bottom-full left-1/2 -translate-x-1/2 mb-2",
        position === 'left' && "right-full top-1/2 -translate-y-1/2 mr-2",
        position === 'right' && "left-full top-1/2 -translate-y-1/2 ml-2"
      )}>
        <span className="flex items-center gap-1">
          {hint}
          {showArrow && <ChevronRight className="w-3 h-3" />}
        </span>
        
        {/* Arrow */}
        <div className={cn(
          "absolute w-2 h-2 bg-accent rotate-45",
          position === 'bottom' && "-top-1 left-1/2 -translate-x-1/2",
          position === 'top' && "-bottom-1 left-1/2 -translate-x-1/2",
          position === 'left' && "-right-1 top-1/2 -translate-y-1/2",
          position === 'right' && "-left-1 top-1/2 -translate-y-1/2"
        )} />
      </div>
    </div>
  );
}

// Success checkmark animation
export function DemoSuccess({ show }: { show: boolean }) {
  if (!show) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center animate-scale-in">
        <svg className="w-12 h-12 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path 
            d="M5 13l4 4L19 7" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="animate-draw-check"
          />
        </svg>
      </div>
    </div>
  );
}
