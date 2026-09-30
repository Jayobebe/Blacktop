import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useWhat3Words } from '@/lib/what3words';

/** what3words' own red, for the /// (their brand rule: the slashes are always red). */
const W3W_RED = '#E11F26';

/**
 * A position's what3words ("///filled.count.soap"), tap to copy. Renders
 * nothing until it's loaded, and nothing at all without a what3words key.
 */
export function W3WAddress({
  lat,
  lng,
  className,
  showNearest = false,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  className?: string;
  /** Add the nearest place under the words ("near Bayswater, London"). */
  showNearest?: boolean;
}) {
  const place = useWhat3Words(lat, lng);
  if (!place) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`///${place.words}`);
      toast.success(tr("what3words address copied"));
    } catch {
      /* the words are on screen to read out */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={tr("what3words address {0}. Tap to copy.", [place.words])}
      className={cn('inline-flex flex-col items-center text-center font-semibold leading-tight', className)}
    >
      <span className="break-all">
        <span style={{ color: W3W_RED }}>///</span>
        {place.words}
      </span>
      {showNearest && place.nearest && <span className="text-[0.75em] font-normal opacity-75">{tr("near {0}", [place.nearest])}</span>}
    </button>
  );
}
