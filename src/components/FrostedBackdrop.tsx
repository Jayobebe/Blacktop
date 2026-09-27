import { cn } from '@/lib/utils';

/**
 * Still, softly lit backdrop for full-screen flows (welcome, onboarding, demo).
 * Content on top uses translucent, blurred surfaces (`.frost`), so screens read
 * as frosted glass over light — the same feel as the radio overlay over Home.
 * Deliberately static: no motion behind text.
 */
export function FrostedBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background', className)}>
      <div className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-[140vmax] h-[70vmax] rounded-full bg-accent/[0.14] blur-[120px]" />
      <div className="absolute top-[35%] -left-[30%] w-[80vmax] h-[80vmax] rounded-full bg-white/[0.035] blur-[120px]" />
      <div className="absolute -bottom-[35%] -right-[25%] w-[80vmax] h-[80vmax] rounded-full bg-accent/[0.06] blur-[140px]" />
      {/* Vignette keeps edges calm and text contrast high */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_100%)]" />
    </div>
  );
}
