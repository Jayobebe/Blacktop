import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { FrostedBackdrop } from '@/components/FrostedBackdrop';

interface SetupShellProps {
  /** Unique per step — remounting on change replays the entrance animation. */
  stepKey: string;
  direction: 'forward' | 'back';
  progress?: { current: number; total: number };
  onBack?: () => void;
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Full-screen chrome for every setup/onboarding step: frosted backdrop,
 * back button, segmented progress, direction-aware step transitions and a
 * pinned footer for the primary action.
 */
export function SetupShell({ stepKey, direction, progress, onBack, eyebrow, title, subtitle, children, footer }: SetupShellProps) {
  return (
    <div className="relative isolate h-dvh max-h-dvh flex flex-col overflow-hidden">
      <FrostedBackdrop />

      {/* Top bar */}
      {(onBack || progress) && (
        <div className="relative z-10 flex items-center gap-3 px-4 pt-3 safe-top">
          <button
            type="button"
            onClick={() => {
              haptics.tick();
              onBack?.();
            }}
            disabled={!onBack}
            aria-label="Back"
            className={cn(
              'pressable frost w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground',
              !onBack && 'invisible'
            )}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {progress && (
            <div className="flex-1 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={progress.total} aria-valuenow={progress.current}>
              {Array.from({ length: progress.total }, (_, i) => (
                <div key={i} className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-[width] duration-500 ease-spring"
                    style={{ width: i < progress.current ? '100%' : '0%' }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="w-10" />
        </div>
      )}

      {/* Step body */}
      <div
        key={stepKey}
        className={cn(
          'relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-4',
          direction === 'forward' ? 'page-in-forward' : 'page-in-back'
        )}
      >
        <div className="max-w-md mx-auto">
          {(eyebrow || title || subtitle) && (
            <header className="mb-6">
              {eyebrow && <p className="text-[13px] font-medium text-accent mb-1.5">{eyebrow}</p>}
              {title && <h1 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">{title}</h1>}
              {subtitle && <p className="text-[15px] text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>}
            </header>
          )}
          {children}
        </div>
      </div>

      {footer && (
        <div className="relative z-10 px-5 pt-3 pb-4 safe-bottom bg-gradient-to-t from-background/90 via-background/60 to-transparent">
          <div className="max-w-md mx-auto">{footer}</div>
        </div>
      )}
    </div>
  );
}
