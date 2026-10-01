import type { LatLng, TrackDef } from '../types';
import { isClosedLap } from '../lib/centerline';
import { LIBRARY_ATTRIBUTION, type LibraryLayout } from '../lib/circuitLibrary';
import { ChaseCamPlacer } from './ChaseCamPlacer';
import { pitLanesNear, withPits } from '../lib/pitLanes';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';

/**
 * Creates or edits a track, always in the chase cam:
 *   - from the circuit library (`library`), with the layout's name and (if
 *     mapped) start line;
 *   - from a GPS lap (`loop`);
 *   - editing a saved track, on its outline. (Picking roads on the map was
 *     dropped: the public map-data servers it needed were too unreliable.
 *     Tracks saved before outlines existed can't be re-edited; they still race.)
 */
export function TrackEditor({
  initial,
  loop: recorded,
  library,
  onSave,
  onCancel,
}: {
  initial?: TrackDef;
  /** A lap recorded with GPS, in running order. */
  loop?: LatLng[];
  /** A circuit library layout. */
  library?: LibraryLayout;
  onSave: (t: TrackDef) => void;
  onCancel: () => void;
}) {
  const loop = recorded ?? library?.loop ?? (initial && isClosedLap(initial.outline) ? initial.outline : null);
  const source: TrackDef['source'] = library ? 'library' : recorded ? 'gps' : 'map';

  if (!loop) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4 p-6 text-center safe-top safe-bottom">
        <p className="text-sm max-w-xs">{tr("This track was saved before track outlines, so its lines can't be moved. It still times as it is. To change it, record a lap with GPS or pick it from the circuit library.")}</p>
        <Button onClick={onCancel}>{tr("Back")}</Button>
      </div>
    );
  }
  return (
    <ChaseCamPlacer
      key={loop.length + ':' + loop[0].lat}
      loop={loop}
      base={initial}
      name={library?.name}
      startHint={library?.start}
      meta={initial ? undefined : { source, osmId: library?.id }}
      attribution={library ? LIBRARY_ATTRIBUTION : undefined}
      // Pit lane timing lines: the layout's pit lane, the track's own, or (a GPS lap
      // at a real circuit) the nearest library venue's.
      onSave={async (t) => {
        const lines = library?.pits ?? initial?.pitLane ?? (await pitLanesNear(t));
        onSave(withPits(t, lines));
      }}
      onCancel={onCancel}
    />
  );
}
