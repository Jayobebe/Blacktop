import { useNavigate, useSearchParams } from 'react-router-dom';
import { RacerView, PitView, SessionDetail, useTrackStore } from '@/features/track';

/**
 * Track Pack: racer (timing + pairing QR) or pit crew (scanner + live timing).
 * `?session=<id>` opens a saved session straight from a ride's receipt.
 */
export default function Track() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { sessions } = useTrackStore();
  const sessionId = params.get('session');
  if (sessionId) {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) return <SessionDetail session={session} onBack={() => navigate(-1)} />;
  }
  return params.get('role') === 'pit' ? <PitView /> : <RacerView />;
}
