import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Loading map…" over the app backdrop: no panel of its own, so the moving
 * wordmark (sped up while the map loads, see BackdropHost) is the loading
 * screen. Used while the map's code downloads and while it draws its first view.
 */
export function MapLoading({ className }: { className?: string }) {
  return (
    <div className={cn('fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none', className)} aria-busy="true" aria-label="Loading map">
      <span className="flex items-center gap-2 rounded-full frost-accent px-4 py-2 text-xs font-medium shadow-lg">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading map…
      </span>
    </div>
  );
}
