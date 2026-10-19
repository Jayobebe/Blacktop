import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { warpActive } from '@/lib/warp';

/**
 * "Loading map…" over the app backdrop: no panel of its own, so the moving
 * wordmark (sped up while the map loads, see BackdropHost) is the loading
 * screen. Used while the map's code downloads and while it draws its first view,
 * and only when no pixel warp is up: opening the map holds the warp over it
 * until it has drawn (useMapOverlay), so this is for Thermal mode and reduced
 * motion, where the warp doesn't run, or a load that outlasts the warp's hold.
 */
export function MapLoading({ className }: { className?: string }) {
  if (warpActive()) return null;
  return (
    <div className={cn('fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none', className)} aria-busy="true" aria-label={tr("Loading map")}>
      <span className="flex items-center gap-2 rounded-full frost-accent px-4 py-2 text-xs font-medium shadow-lg">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}{tr("Loading map…")}
      </span>
    </div>
  );
}
