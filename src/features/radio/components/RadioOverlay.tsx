import { useEffect, useMemo, useRef, useState } from 'react';
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
import { LIVE_STATIONS } from '../lib/liveStations';
import { tr } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

/**
 * GTA-style radio dial: stations sit around a wheel, the active one locks to
 * the top. Everything renders in a portal so switching stations never
 * navigates away from the ride or map underneath.
 */
export function RadioOverlay() {
  const isOpen = useRadioOverlay();
  const { stations: ownStations } = useRadioStations();
  const stations = useMemo(() => [...LIVE_STATIONS, ...ownStations], [ownStations]);
  const player = useRadioPlayer();
  const isLive = !!LIVE_STATIONS.find((s) => s.id === player.stationId);
  const [showManager, setShowManager] = useState(false);
  const [dialRotation, setDialRotation] = useState(0);
  const gesture = useRef<{ angle: number; index: number; steps: number } | null>(null);
  const dragged = useRef(false);

  const activeIndex = useMemo(
    () => Math.max(0, stations.findIndex((s) => s.id === player.stationId)),
    [stations, player.stationId],
  );
  const step = stations.length ? 360 / stations.length : 0;

  useEffect(() => {
    const target = -activeIndex * step;
    setDialRotation((current) => current + ((target - current + 540) % 360 + 360) % 360 - 180);
  }, [activeIndex, step]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRadioOverlay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleReselect = async () => {
    const station = stations.find((s) => s.id === player.stationId);
    if (!station) return;
    // Browsers without persistent handles (iOS Safari) need the files picked
    // again each session; the freshly picked list replaces the old one.
    const { tracks } = await pickWithInput();
    if (!tracks.length) return;
    await updateStation(station.id, { tracks });
    toast.success(tr("Station reloaded from your files"));
    void playStation({ ...station, tracks });
  };


  return createPortal(
    <div className="radio-overlay fixed inset-0 z-[1200] flex flex-col bg-background/40 backdrop-blur-2xl backdrop-saturate-150 animate-fade-in safe-bottom landscape:max-h-[100dvh] landscape:overflow-hidden">
      {/* Clear of the notch / Dynamic Island, and the side notch in landscape (env() on the header itself). */}
      <div className="flex items-center justify-between shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)', paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">{tr("Blacktop Radio")}</p>
        <button
          type="button"
          onClick={closeRadioOverlay}
          aria-label={tr("Close radio")}
          className="glove-hit w-9 h-9 landscape:w-8 landscape:h-8 rounded-full bg-secondary hover:bg-muted flex items-center justify-center"
        >
          <X className="w-4 h-4 landscape:w-3.5 landscape:h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col landscape:flex-row items-center justify-center gap-6 landscape:gap-10 px-4 py-4 landscape:px-8 landscape:py-2">
        {stations.length === 0 ? (
          <div className="text-center max-w-xs space-y-3">
            <p className="text-sm text-muted-foreground">
              {tr("No stations yet. Build one from the music already on your device.")}
            </p>
            <button
              type="button"
              onClick={() => setShowManager(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-accent text-accent text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />{" "}{tr("Add Station")}
            </button>
          </div>
        ) : (
          <>
            {/* The dial */}
            {/* --dial drives the dial, station orbit and hub, so they stay in proportion at any size.
                Landscape caps it by viewport height so short phone screens never clip. */}
            <div
              className="relative shrink-0 touch-none select-none w-[var(--dial)] h-[var(--dial)] [--dial:280px] landscape:[--dial:min(230px,calc(100dvh-116px))]"
              onPointerDown={(event) => {
                dragged.current = false;
                const bounds = event.currentTarget.getBoundingClientRect();
                gesture.current = { angle: Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2), index: activeIndex, steps: 0 };
              }}
              onPointerMove={(event) => {
                const start = gesture.current;
                if (!start || !step) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const angle = Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2);
                const delta = Math.atan2(Math.sin(angle - start.angle), Math.cos(angle - start.angle)) * 180 / Math.PI;
                if (Math.abs(delta) > 8) dragged.current = true;
                start.steps = Math.round(delta / step);
                setDialRotation(-start.index * step + delta);
              }}
              onPointerUp={() => {
                const start = gesture.current;
                gesture.current = null;
                if (!start) return;
                const index = ((start.index - start.steps) % stations.length + stations.length) % stations.length;
                const station = stations[index];
                setDialRotation((current) => current + ((-index * step - current + 540) % 360 + 360) % 360 - 180);
                if (start.steps && station) void playStation(station);
              }}
              onPointerCancel={() => { gesture.current = null; setDialRotation(-activeIndex * step); }}
              onPointerLeave={() => { gesture.current = null; setDialRotation(-activeIndex * step); }}
              onClickCapture={(event) => {
                // A drag releases as a click on touch screens; only a tap tunes a station.
                if (dragged.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
                dragged.current = false;
              }}
            >
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
                    <Button
                      key={station.id}
                      type="button"
                      onClick={() => void playStation(station)}
                      aria-label={tr("Play {0}", [station.name])}
                      aria-pressed={isActive}
                      variant="ghost"
                      className="absolute left-1/2 top-1/2 h-auto min-h-12 w-[72px] p-0 flex flex-col items-center gap-1 hover:bg-transparent transition-transform duration-500 motion-reduce:transition-none"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--dial) * -0.4)) rotate(${-angle - dialRotation}deg)`,
                      }}
                    >
                      <span
                        className={cn(
                          'w-12 h-12 landscape:w-9 landscape:h-9 rounded-full flex items-center justify-center border transition-all',
                          isActive ? 'scale-110' : 'opacity-70',
                        )}
                        style={{
                          backgroundColor: `hsl(${hsl} / ${isActive ? 0.25 : 0.12})`,
                          borderColor: `hsl(${hsl} / ${isActive ? 0.9 : 0.35})`,
                          boxShadow: isActive ? `0 0 22px hsl(${hsl} / 0.5)` : undefined,
                          color: `hsl(${hsl})`,
                        }}
                      >
                        <Icon className="w-5 h-5 landscape:w-4 landscape:h-4" />
                      </span>
                      <span className={cn('text-[10px] landscape:text-[9px] max-w-[72px] landscape:max-w-[60px] truncate', isActive ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                        {station.name}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {/* Hub */}
              <div className="absolute inset-[31%] rounded-full bg-card border border-border flex flex-col items-center justify-center text-center px-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{tr("Station")}</p>
                <p className="text-sm font-bold truncate max-w-full">{player.stationName || tr("Off air")}</p>
              </div>
            </div>

            {/* Now playing */}
            <div className="w-full max-w-sm landscape:max-w-xs landscape:flex-1 space-y-2 landscape:space-y-1.5">
              <p className="text-center text-sm font-semibold truncate">{trackTitle(player.trackName)}</p>
              {player.needsReselect && (
                <button
                  type="button"
                  onClick={handleReselect}
                  className="w-full flex items-center justify-center gap-2 text-xs text-warning border border-warning/50 rounded-lg py-2"
                >
                  <FolderOpen className="w-3.5 h-3.5" />{" "}{tr("Please reselect your files for this station")}
                </button>
              )}
              {isLive ? (
                <p className="text-center text-[10px] uppercase tracking-widest text-destructive font-bold">● {tr("On air")}</p>
              ) : (<>
              <input
                type="range"
                min={0}
                max={Math.max(1, player.duration)}
                step={0.5}
                value={Math.min(player.position, player.duration || 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label={tr("Track position")}
                className="w-full accent-[hsl(var(--accent))]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{formatClock(player.position)}</span>
                <span>{formatClock(player.duration)}</span>
              </div>
              </>)}

              <div className="flex items-center justify-center gap-6 landscape:gap-4 pt-1">
                <button type="button" onClick={() => void previous()} aria-label={tr("Previous track")} className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-full bg-secondary hover:bg-muted flex items-center justify-center">
                  <SkipBack className="w-5 h-5 landscape:w-4 landscape:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggle()}
                  aria-label={player.isPlaying ? tr("Pause") : tr("Play")}
                  className="w-16 h-16 landscape:w-12 landscape:h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-glow"
                >
                  {player.isPlaying ? <Pause className="w-7 h-7 landscape:w-5 landscape:h-5" /> : <Play className="w-7 h-7 landscape:w-5 landscape:h-5 ml-0.5" />}
                </button>
                <button type="button" onClick={() => void next()} aria-label={tr("Next track")} className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-full bg-secondary hover:bg-muted flex items-center justify-center">
                  <SkipForward className="w-5 h-5 landscape:w-4 landscape:h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowManager(true)}
                className="w-full mt-2 landscape:mt-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                {tr("Manage stations")}
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
