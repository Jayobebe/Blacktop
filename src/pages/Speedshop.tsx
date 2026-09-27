import { Navigate } from 'react-router-dom';
import { useSettings } from '@/features/settings';
import { SpeedshopView } from '@/features/speedshop';

/** Speedshop lives in Blacktop World, so it follows the World opt-in. */
export default function Speedshop() {
  const { settings } = useSettings();
  if (!settings.blacktopWorldEnabled) return <Navigate to="/world" replace />;
  return <SpeedshopView />;
}
