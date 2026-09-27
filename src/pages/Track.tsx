import { useSearchParams } from 'react-router-dom';
import { RacerView, PitView } from '@/features/track';

/** Track Pack: racer (timing + pairing QR) or pit crew (scanner + live timing). */
export default function Track() {
  const [params] = useSearchParams();
  return params.get('role') === 'pit' ? <PitView /> : <RacerView />;
}
