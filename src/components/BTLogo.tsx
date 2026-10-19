import { cn } from '@/lib/utils';

interface BTLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BTLogo({ className, size = 'md' }: BTLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-background border border-accent/30 overflow-hidden",
        sizeClasses[size],
        className
      )}
      style={{
        boxShadow: '0 0 12px hsl(var(--accent) / 0.5)',
      }}
    >
      <img
        src="/img/bt-mark.png"
        alt="Blacktop"
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}
