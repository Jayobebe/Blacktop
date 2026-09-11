import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause, SkipBack, SkipForward, Plus, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRadioStations, updateStation } from '../hooks/useRadioStations';
import { useRadioPlayer, playStation, toggle, next, previous, seek } from '../hooks/useRadioPlayer';
import { useRadioOverlay, closeRadioOverlay } from '../hooks/useRadioOverlay';
import { getRadioIcon, stationHsl, trackTitle, formatClock } from '../lib/stationVisuals';
import { pickWithInput } from '../lib/audioFiles';
import { StationManager } from './StationManager';

/**
 * GTA-style radio dial: stations sit around a wheel, the active one locks to
 * the top. Everything renders in a portal so switching stations never
 * navigates away from the ride or map underneath.
 */
export function RadioOverlay() {
  const isOpen = useRadioOverlay();
  const { stations } = useRadioStations();
  const player = useRadioPlayer();
  const [showManager, setShowManager] = useState(false);

  const activeIndex = useMemo(
    () => Math.max(0, stations.findIndex((s) => s.id === player.stationId)),
    [stations, player.stationId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRadioOverlay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const step = stations.length ? 360 / stations.length : 0;
  const dialRotation = -activeIndex * step;

  const handleReselect = async () => {
    const station = stations.find((s) => s.id === player.stationId);
    if (!station) return;
    // Browsers without persistent handles (iOS Safari) need the files picked
    // again each session; the freshly picked list replaces the old one.
    const { tracks } = await pickWithInput();
    if (!tracks.length) return;
    await updateStation(station.id, { tracks });
    toast.success('Station reloaded from your files');
    void playStation({ ...station, tracks });
  };


  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-background/92 backdrop-blur-xl animate-fade-in safe-bottom landscape:justify-center">
      <div className="flex items-center justify-between px-4 pt-4 landscape:pt-2 landscape:pb-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">Blacktop Radio</p>
        <button
          type="button"
          onClick={closeRadioOverlay}
          aria-label="Close radio"
          className="w-9 h-9 landscape:w-8 landscape:h-8 rounded-full bg-secondary hover:bg-muted flex items-center justify-center"
        >
          <X className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
        </button>
      </div>

      <div className="flex-1 landscape:flex-none overflow-y-auto flex flex-col items-center justify-center gap-6 landscape:gap-3 px-4 py-4 landscape:py-2">
        {stations.length === 0 ? (
          <div className="text-center max-w-xs space-y-3">
            <p className="text-sm text-muted-foreground">
              No stations yet. Build one from the music already on your device.
            </p>
            <button
              type="button"
              onClick={() => setShowManager(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-accent text-accent text-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> Add Station
            </button>
          </div>
        ) : (
          <>
            {/* The dial */}
            <div className="relative w-[280px] h-[280px] shrink-0">
              <div className="absolute inset-0 rounded-full border border-border/60 bg-card/40" />
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-accent" />
              <div
                className="absolute inset-0 transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${dialRotation}deg)` }}
              >
                {stations.map((station, i) => {
                  const angle = i * step;
                  const Icon = getRadioIcon(station.icon);
                  const hsl = stationHsl(station.color);
                  const isActive = station.id === player.stationId;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => void playStation(station)}
                      aria-label={`Play ${station.name}`}
                      aria-pressed={isActive}
                      className="absolute left-1/2 top-1/2 flex flex-col items-center gap-1"
                      style={{
                        transform: `rotate(${angle}deg) translateY(-112px) rotate(${-angle - dialRotation}deg) translate(-50%, -50%)`,
                      }}
                    >
                      <span
                        className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center border transition-all',
                          isActive ? 'scale-110' : 'opacity-70',
                        )}
                        style={{
                          backgroundColor: `hsl(${hsl} / ${isActive ? 0.25 : 0.12})`,
                          borderColor: `hsl(${hsl} / ${isActive ? 0.9 : 0.35})`,
                          boxShadow: isActive ? `0 0 22px hsl(${hsl} / 0.5)` : undefined,
                          color: `hsl(${hsl})`,
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className={cn('text-[10px] max-w-[72px] truncate', isActive ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                        {station.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Hub */}
              <div className="absolute inset-[86px] rounded-full bg-card border border-border flex flex-col items-center justify-center text-center px-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Station</p>
                <p className="text-sm font-bold truncate max-w-full">{player.stationName || 'Off air'}</p>
              </div>
            </div>

            {/* Now playing */}
            <div className="w-full max-w-sm space-y-2">
              <p className="text-center text-sm font-semibold truncate">{trackTitle(player.trackName)}</p>
              {player.needsReselect && (
                <button
                  type="button"
                  onClick={handleReselect}
                  className="w-full flex items-center justify-center gap-2 text-xs text-warning border border-warning/50 rounded-lg py-2"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Please reselect your files for this station
                </button>
              )}
              <input
                type="range"
                min={0}
                max={Math.max(1, player.duration)}
                step={0.5}
                value={Math.min(player.position, player.duration || 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Track position"
                className="w-full accent-[hsl(var(--accent))]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{formatClock(player.position)}</span>
                <span>{formatClock(player.duration)}</span>
              </div>

              <div className="flex items-center justify-center gap-6 pt-1">
                <button type="button" onClick={() => void previous()} aria-label="Previous track" className="w-12 h-12 rounded-full bg-secondary hover:bg-muted flex items-center justify-center">
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggle()}
                  aria-label={player.isPlaying ? 'Pause' : 'Play'}
                  className="w-16 h-16 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-glow"
                >
                  {player.isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
                </button>
                <button type="button" onClick={() => void next()} aria-label="Next track" className="w-12 h-12 rounded-full bg-secondary hover:bg-muted flex items-center justify-center">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowManager(true)}
                className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Manage stations
              </button>
            </div>
          </>
        )}
      </div>

      {showManager && <StationManager onClose={() => setShowManager(false)} />}
    </div>,
    document.body,
  );
}
