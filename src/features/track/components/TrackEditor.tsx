import { useState } from 'react';
import type { LatLng, TrackDef } from '../types';
import { isClosedLap } from '../lib/centerline';
import { gateCentre } from '../lib/walker';
import { LIBRARY_ATTRIBUTION, type LibraryLayout } from '../lib/circuitLibrary';
import { RoadPicker } from './RoadPicker';
import { ChaseCamPlacer } from './ChaseCamPlacer';
import { tr } from '@/lib/i18n';

/**
 * Creates or edits a track:
 *   - from the circuit library (`library`): straight to the chase cam, with
 *     the layout's name and (if mapped) start line;
 *   - from the map: frame the circuit, keep its roads (RoadPicker), then place
 *     the lines with the chase cam;
 *   - from a GPS lap (`loop`): straight to the chase cam;
 *   - editing a saved track: the chase cam on its outline, with "Change
 *     roads" to re-pick the lap. Older tracks drawn before outlines existed
 *     start at the road picker, centred on their start/finish.
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
  const [loop, setLoop] = useState<LatLng[] | null>(
    () => recorded ?? library?.loop ?? (initial && isClosedLap(initial.outline) ? initial.outline : null),
  );
  const [picked, setPicked] = useState(false);
  const source: TrackDef['source'] = library ? 'library' : recorded ? 'gps' : 'map';

  if (!loop) {
    return (
      <RoadPicker
        center={initial ? gateCentre(initial.startFinish) : library ? library.loop[0] : undefined}
        onLoop={(l) => {
          setPicked(true);
          setLoop(l);
        }}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ChaseCamPlacer
      key={loop.length + ':' + loop[0].lat}
      loop={loop}
      base={initial}
      name={library?.name}
      startHint={library && !picked ? library.start : undefined}
      meta={initial ? undefined : { source: picked ? 'map' : source, osmId: picked ? undefined : library?.id }}
      attribution={library && !picked ? LIBRARY_ATTRIBUTION : undefined}
      onBack={recorded ? undefined : () => setLoop(null)}
      backLabel={tr("Roads")}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
