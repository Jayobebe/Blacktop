import { useRadioPlayer } from './useRadioPlayer';
import { useRadioStations } from './useRadioStations';
import { LIVE_STATIONS } from '../lib/liveStations';
import type { RadioStation } from '../types';

/** The station loaded in the player (live or the rider's own), or null. */
export function useLoadedStation(): RadioStation | null {
  const player = useRadioPlayer();
  const { stations } = useRadioStations();
  if (!player.stationId) return null;
  return LIVE_STATIONS.find((s) => s.id === player.stationId) ?? stations.find((s) => s.id === player.stationId) ?? null;
}
