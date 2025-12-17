import { cn } from '@/lib/utils';

interface BTLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BTLogo({ className, size = 'md' }: BTLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-lg',
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-background border border-accent/30 font-display font-black tracking-tighter text-accent",
        sizeClasses[size],
        className
      )}
      style={{
        textShadow: '0 0 12px hsl(var(--accent) / 0.5)',
      }}
    >
      <span className="-mr-[0.1em]">B</span>
      <span className="-ml-[0.1em]">T</span>
    </div>
  );
}
