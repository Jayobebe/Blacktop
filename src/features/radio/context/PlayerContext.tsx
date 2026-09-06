import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RadioStation } from '../types';
import {
  useRadioPlayer,
  playStation,
  play as playCurrent,
  pause as pauseAudio,
  stop as stopAudio,
} from '../hooks/useRadioPlayer';

interface PlayerContextValue {
  /** Start a station, or resume the current one when called with no argument. */
  play: (track?: RadioStation) => Promise<void>;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTrack: string | null;
  stationName: string | null;
  stationId: string | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Mounts above the router so playback state survives route changes.
 * The underlying audio element and loading/permission flow are unchanged —
 * this only lifts the state into a stable app-level provider.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useRadioPlayer();

  const value = useMemo<PlayerContextValue>(
    () => ({
      play: async (track?: RadioStation) => {
        if (track) await playStation(track);
        else await playCurrent();
      },
      pause: pauseAudio,
      stop: stopAudio,
      isPlaying: player.isPlaying,
      currentTrack: player.trackName,
      stationName: player.stationName,
      stationId: player.stationId,
    }),
    [player.isPlaying, player.trackName, player.stationName, player.stationId],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
