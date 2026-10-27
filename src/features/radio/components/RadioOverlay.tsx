import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause, SkipBack, SkipForward, Plus, FolderOpen, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRadioStations, updateStation } from '../hooks/useRadioStations';
import { useRadioPlayer, playStation, toggle, next, previous, seek } from '../hooks/useRadioPlayer';
import { useRadioOverlay, closeRadioOverlay } from '../hooks/useRadioOverlay';
import { useLiveNowPlaying } from '../hooks/useLiveNowPlaying';
import { getRadioIcon, stationHsl, trackTitle, formatClock } from '../lib/stationVisuals';
import { pickWithInput } from '../lib/audioFiles';
import { PRESET_COUNT, setPreset, usePresets } from '../lib/presets';
import { StationManager } from './StationManager';
import { EqBars } from './EqBars';
import { LIVE_STATIONS } from '../lib/liveStations';
import type { RadioStation } from '../types';
import { tr } from '@/lib/i18n';
import { PageTips } from '@/features/guide';
import { haptics } from '@/lib/haptics';
import { appSoundsOn } from '@/lib/appSound';
import { tuningStatic } from '@/lib/radioFx';
import { isThermal } from '@/lib/thermal';

/**
 * Blacktop Radio, laid out like a car's head unit: the station on now as a
 * card in its own colour (what's playing: the live station's song, or the
 * track and where it's got to), a tuning band of every station under a fixed
 * needle (drag or flick it; static between stations; letting go tunes in),
 * the transport, and six presets (tap to tune, hold to save the station
 * playing). Portrait stacks them; landscape puts the card on the left and the
 * controls on the right, so nothing scrolls on a phone on its side. Rendered
 * in a portal, so tuning never navigates away from the ride or map beneath.
 */
export function RadioOverlay() {
  const isOpen = useRadioOverlay();
  const { stations: ownStations } = useRadioStations();
  const stations = useMemo(() => [...LIVE_STATIONS, ...ownStations], [ownStations]);
  const player = useRadioPlayer();
  const station = stations.find((s) => s.id === player.stationId) ?? null;
  const isLive = !!station?.streamUrl;
  const song = useLiveNowPlaying(station, isOpen && isLive && player.isPlaying);
  const [showManager, setShowManager] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRadioOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleReselect = async () => {
    if (!station) return;
    // Browsers without persistent handles (iOS Safari) need the files picked
    // again each session; the freshly picked list replaces the old one.
    const { tracks } = await pickWithInput();
    if (!tracks.length) return;
    await updateStation(station.id, { tracks });
    toast.success(tr("Station reloaded from your files"));
    void playStation({ ...station, tracks });
  };

  const onPlay = () => {
    if (!station && stations[0]) void playStation(stations[0]);
    else void toggle();
  };

  return createPortal(
    <div className="radio-overlay radio-mica fixed inset-0 z-[1200] flex flex-col animate-fade-in safe-bottom safe-frame-x">
      {/* Clear of the notch / Dynamic Island; the sides (the notch in landscape) are the overlay's safe-frame-x. */}
      <div className="flex items-center justify-between shrink-0 px-4" style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">{tr("Blacktop Radio")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-tip="radio-manage"
            onClick={() => setShowManager(true)}
            aria-label={tr("Manage stations")}
            className="glove-hit w-9 h-9 rounded-xl bg-secondary hover:bg-muted flex items-center justify-center"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={closeRadioOverlay}
            aria-label={tr("Close radio")}
            className="glove-hit w-9 h-9 rounded-xl bg-secondary hover:bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <PageTips
        page="radio"
        when={stations.length > 0 && !showManager}
        tips={[
          { target: '[data-tip="radio-band"]', text: tr("Drag the band to tune. Let go on a station to play it.") },
          { target: '[data-tip="radio-presets"]', text: tr("Presets: tap one to jump to it, hold one to save the station you're on.") },
          { target: '[data-tip="radio-manage"]', text: tr("Make your own stations here from the music on your phone.") },
        ]}
      />

      {stations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-xs space-y-3">
            <p className="text-sm text-muted-foreground">{tr("No stations yet. Build one from the music already on your device.")}</p>
            <button
              type="button"
              onClick={() => setShowManager(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-accent text-accent text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />{" "}{tr("Add Station")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3 landscape:grid landscape:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] landscape:gap-4 landscape:overflow-hidden landscape:py-2">
          {/* What's on. */}
          <NowPlaying
            station={station}
            playing={player.isPlaying}
            title={isLive ? (song ? song.title : tr("Live")) : player.trackName ? trackTitle(player.trackName) : null}
            artist={isLive ? song?.artist ?? null : null}
            live={isLive}
            position={player.position}
            duration={player.duration}
            onReselect={player.needsReselect ? handleReselect : undefined}
          />

          {/* The controls: under the card in portrait (near the thumb), beside it in landscape. */}
          <div className="flex flex-col gap-3 landscape:justify-center min-w-0 shrink-0">
            <StationBand stations={stations} activeId={player.stationId} onTune={(s) => void playStation(s)} />

            <div className="flex items-center justify-center gap-4">
              <button type="button" onClick={() => void previous()} aria-label={isLive ? tr("Previous station") : tr("Previous track")} className="w-12 h-12 rounded-2xl bg-secondary hover:bg-muted flex items-center justify-center">
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onPlay}
                aria-label={player.isPlaying ? tr("Pause") : tr("Play")}
                className="w-16 h-16 landscape:w-14 landscape:h-14 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shadow-glow"
              >
                {player.isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
              </button>
              <button type="button" onClick={() => void next()} aria-label={isLive ? tr("Next station") : tr("Next track")} className="w-12 h-12 rounded-2xl bg-secondary hover:bg-muted flex items-center justify-center">
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <Presets stations={stations} activeId={player.stationId} />
          </div>
        </div>
      )}

      {showManager && <StationManager onClose={() => setShowManager(false)} />}
    </div>,
    document.body,
  );
}

/** The station on now, as a card in its colour. */
function NowPlaying({
  station,
  playing,
  title,
  artist,
  live,
  position,
  duration,
  onReselect,
}: {
  station: RadioStation | null;
  playing: boolean;
  title: string | null;
  artist: string | null;
  live: boolean;
  position: number;
  duration: number;
  onReselect?: () => void;
}) {
  const hsl = station ? stationHsl(station.color) : null;
  const Icon = station ? getRadioIcon(station.icon) : null;
  return (
    <div
      className="relative rounded-3xl border p-4 flex flex-col justify-between gap-3 flex-1 min-h-[11rem] landscape:min-h-0 landscape:h-full overflow-hidden no-frost"
      style={hsl ? { backgroundColor: `hsl(${hsl} / 0.14)`, borderColor: `hsl(${hsl} / 0.6)` } : { borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-start justify-between gap-3">
        {Icon && hsl ? (
          <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `hsl(${hsl} / 0.25)`, color: `hsl(${hsl})` }}>
            <Icon className="w-5 h-5" />
          </span>
        ) : (
          <span />
        )}
        {live && playing && <span className="text-[10px] uppercase tracking-widest font-bold text-destructive">● {tr("On air")}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold truncate">{station?.name ?? tr("Off air")}</p>
        {title && <p className="text-sm text-foreground/80 truncate">{title}</p>}
        {artist && <p className="text-xs text-muted-foreground truncate">{artist}</p>}
        {!station && <p className="text-sm text-muted-foreground">{tr("Turn the band or tap a preset to tune in.")}</p>}
      </div>
      {onReselect && (
        <button type="button" onClick={onReselect} className="w-full flex items-center justify-center gap-2 text-xs text-warning border border-warning/50 rounded-lg py-2">
          <FolderOpen className="w-3.5 h-3.5" />{" "}{tr("Please reselect your files for this station")}
        </button>
      )}
      <div className="flex items-end gap-3">
        {station && !live ? (
          <div className="flex-1 min-w-0">
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.5}
              value={Math.min(position, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label={tr("Track position")}
              className="w-full accent-[hsl(var(--accent))]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>{formatClock(position)}</span>
              <span>{formatClock(duration)}</span>
            </div>
          </div>
        ) : (
          <p className="flex-1 text-[10px] text-muted-foreground">{live ? tr("Streamed by SomaFM, listener-supported radio.") : ''}</p>
        )}
        {station && hsl && <EqBars playing={playing} className="text-[28px] shrink-0" style={{ color: `hsl(${hsl})` }} />}
      </div>
    </div>
  );
}

/** Every station along a band under a fixed needle: drag or flick it, static between stations, letting go tunes in. */
function StationBand({ stations, activeId, onTune }: { stations: RadioStation[]; activeId: string | null; onTune: (s: RadioStation) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const n = stations.length;
  const W = 104;
  const still = isThermal() || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const activeIndex = Math.max(0, stations.findIndex((s) => s.id === activeId));
  const s = useRef({ pos: n + activeIndex, vel: 0, target: null as number | null, drag: null as null | { x: number; pos: number; moved: number; hist: Array<[number, number]> }, raf: 0, lastCross: 0 });
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const onTuneRef = useRef(onTune);
  onTuneRef.current = onTune;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // The station changed from elsewhere (a preset, next / previous): glide to it the short way round.
  useEffect(() => {
    const st = s.current;
    if (st.drag || n === 0) return;
    const cur = st.pos;
    const base = Math.round((cur - activeIndex) / n) * n + activeIndex;
    st.target = base;
    st.vel = 0;
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, n]);

  const draw = () => {
    const el = box.current;
    const tr0 = track.current;
    if (!el || !tr0) return;
    const st = s.current;
    // A lap at a time, the target and a drag's start going round with it (else it chases a lap away forever).
    const shift = n > 1 ? (st.pos < n * 0.5 ? n : st.pos > n * 2.5 ? -n : 0) : 0;
    if (shift) {
      st.pos += shift;
      if (st.target != null) st.target += shift;
      if (st.drag) st.drag.pos += shift;
    }
    tr0.style.transform = `translateX(${el.clientWidth / 2 - W / 2 - st.pos * W}px)`;
    Array.from(tr0.children).forEach((c, i) => {
      const d = Math.abs(i - st.pos);
      (c as HTMLElement).style.opacity = String(Math.max(0.15, 1 - d * 0.32));
    });
  };

  const settle = () => {
    const st = s.current;
    const i = ((Math.round(st.pos) % n) + n) % n;
    const pick = stationsRef.current[i];
    if (pick && pick.id !== activeRef.current) onTuneRef.current(pick);
  };

  const frame = (t: number) => {
    const st = s.current;
    const prev = Math.round(st.pos);
    if (!st.drag) {
      if (st.vel !== 0) {
        st.pos += st.vel * 16;
        st.vel *= 0.92;
        if (Math.abs(st.vel) < 0.0008) {
          st.vel = 0;
          st.target = Math.round(st.pos);
        }
      }
      if (st.target != null && st.vel === 0) {
        st.pos += (st.target - st.pos) * (still ? 1 : 0.22);
        if (Math.abs(st.target - st.pos) < 0.002) {
          st.pos = st.target;
          st.target = null;
          settle();
        }
      }
    }
    // Passing a station: a tick, and static between them.
    if (Math.round(st.pos) !== prev && t - st.lastCross > 90) {
      st.lastCross = t;
      haptics.tick();
      if (appSoundsOn() && (st.drag || st.vel !== 0)) tuningStatic(0.14);
    }
    draw();
    st.raf = st.drag || st.vel !== 0 || st.target != null ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => {
    if (!s.current.raf) s.current.raf = requestAnimationFrame(frame);
  };

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(s.current.raf);
      s.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const onDown = (e: React.PointerEvent) => {
    const st = s.current;
    st.drag = { x: e.clientX, pos: st.pos, moved: 0, hist: [[e.clientX, performance.now()]] };
    st.vel = 0;
    st.target = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    kick();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = s.current.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    d.moved = Math.max(d.moved, Math.abs(dx));
    s.current.pos = d.pos - dx / W;
    d.hist.push([e.clientX, performance.now()]);
    if (d.hist.length > 5) d.hist.shift();
  };
  const onUp = (e: React.PointerEvent) => {
    const st = s.current;
    const d = st.drag;
    if (!d) return;
    st.drag = null;
    if (d.moved < 6) {
      // A tap: on a station either side, step to it.
      const off = e.clientX - (box.current?.getBoundingClientRect().left ?? 0) - (box.current?.clientWidth ?? 0) / 2;
      st.target = Math.round(st.pos) + Math.round(off / W);
    } else if (!still) {
      const a = d.hist[0];
      const b = d.hist[d.hist.length - 1];
      st.vel = -(b[0] - a[0]) / Math.max(16, b[1] - a[1]) / W;
      if (Math.abs(st.vel) < 0.002) {
        st.vel = 0;
        st.target = Math.round(st.pos);
      }
    } else st.target = Math.round(st.pos);
    kick();
  };

  const loop = n > 1 ? [...stations, ...stations, ...stations] : stations;
  return (
    <div
      ref={box}
      data-tip="radio-band"
      role="listbox"
      aria-label={tr("Stations")}
      className="hold-target relative h-16 rounded-2xl border border-accent/35 bg-card/60 overflow-hidden select-none touch-pan-y cursor-grab"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div ref={track} className="absolute inset-y-0 left-0 flex will-change-transform">
        {loop.map((st, i) => {
          const hsl = stationHsl(st.color);
          const on = st.id === activeId;
          return (
            <div key={`${st.id}-${i}`} role="option" aria-selected={on} className="h-full shrink-0 flex flex-col items-center justify-center gap-1 px-1" style={{ width: W }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${hsl})` }} />
              <span className={cn('text-[11px] max-w-full truncate', on ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{st.name}</span>
            </div>
          );
        })}
      </div>
      {/* Tick marks along the band, and the needle as notches on its edges. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2 opacity-40 [background-image:repeating-linear-gradient(90deg,hsl(var(--muted-foreground))_0_1px,transparent_1px_13px)]" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[7px] border-t-accent" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[7px] border-b-accent" />
    </div>
  );
}

/** Six presets: tap to tune, hold to save the station playing into it. */
function Presets({ stations, activeId }: { stations: RadioStation[]; activeId: string | null }) {
  const presets = usePresets();
  const hold = useRef<{ t: number; fired: boolean } | null>(null);
  const start = (slot: number) => {
    const h = { t: 0, fired: false };
    h.t = window.setTimeout(() => {
      h.fired = true;
      if (!activeId) {
        toast(tr("Tune in to a station first, then hold a preset to save it."));
        return;
      }
      setPreset(slot, activeId);
      haptics.light();
      toast.success(tr("Saved to preset {0}", [slot + 1]));
    }, 600);
    hold.current = h;
  };
  const end = () => {
    if (hold.current) window.clearTimeout(hold.current.t);
  };
  const tap = (slot: number) => {
    if (hold.current?.fired) return;
    const st = stations.find((s) => s.id === presets[slot]);
    if (st) void playStation(st);
    else toast(tr("Hold a preset to save the station you're on."));
  };
  return (
    <div data-tip="radio-presets" className="grid grid-cols-6 gap-1.5">
      {Array.from({ length: PRESET_COUNT }, (_, slot) => {
        const st = stations.find((s) => s.id === presets[slot]) ?? null;
        const on = !!st && st.id === activeId;
        const hsl = st ? stationHsl(st.color) : null;
        return (
          <button
            key={slot}
            type="button"
            onPointerDown={() => start(slot)}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => tap(slot)}
            aria-pressed={on}
            aria-label={st ? tr("Preset {0}: {1}", [slot + 1, st.name]) : tr("Preset {0}: empty", [slot + 1])}
            className={cn('hold-target h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 min-w-0 px-1', on ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted-foreground')}
          >
            <span className={cn('text-sm font-bold font-mono', on ? 'text-accent' : 'text-foreground')}>{slot + 1}</span>
            <span className="text-[9px] max-w-full truncate flex items-center gap-1">
              {hsl && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${hsl})` }} />}
              {st ? st.name.split(' ')[0] : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
