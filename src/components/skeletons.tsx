import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Layout-matched loading placeholders. Each mirrors the real screen's
 * geometry so content swaps in without the page jumping.
 */

/** Home-shaped skeleton shown while the profile/session check runs at boot. */
export function AppBootSkeleton() {
  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 w-36" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-2xl mb-3" />
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex gap-3 flex-1">
          <Skeleton className="flex-1 rounded-3xl" />
          <Skeleton className="flex-1 rounded-3xl" />
        </div>
        <Skeleton className="flex-1 rounded-3xl" />
      </div>
      <div className="flex justify-around mt-4 pt-3 border-t border-border/30">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 p-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-2 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stack of list rows (avatar/icon + two text lines + trailing value). */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-card/40 border border-border/30" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-5 w-12 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Full-bleed panel placeholder (maps, charts, media). */
export function PanelSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('relative', className)} aria-busy="true" aria-label={label ?? 'Loading'}>
      <Skeleton className="absolute inset-0 rounded-none" />
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      )}
    </div>
  );
}
