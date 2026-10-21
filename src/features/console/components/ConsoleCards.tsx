import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sun, Moon, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Wind, Snowflake, Sunset, Sunrise,
  Route as RouteIcon, Play, Wrench, Check, CircleParking, Footprints, Repeat2, TrendingUp, TrendingDown, Flame, Award, Users,
  Eye, Trophy, TriangleAlert, Map as MapIcon, Sparkles, Swords, Lightbulb, Radar, Target, Siren, CalendarDays, Coins, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { isThermal } from '@/lib/thermal';
import { kmText, milesText, metresText, tempText, windText, speedText } from '@/lib/units';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/lib/demoMode';
import { demoBlocked } from '@/lib/demoGuard';
import { useParkedSpot, parkedLevelText, walkBackUrl } from '@/lib/parkedSpot';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { useRideHistory, useActiveRide, setSoloRoute, usePeaksHidden, PEAK_HIDDEN } from '@/features/ride';
import { useTrips, legCount, tripFinished, chooseTrip, chooseRouteTrip, type Trip } from '@/features/ride/lib/trips';
import { useSavedRoutes, type SavedRoute } from '@/features/map/lib/savedRoutes';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { useGarage, useBikeStats, dueItems } from '@/features/garage';
import { armAlarm } from '@/features/alarm';
import { useCrew, setActiveCrew } from '@/features/crew/useCrew';
import { crewTotals, weekStats } from '@/features/crew/stats';
import { challengesForWeek, challengeScore, daysLeftInWeek, type CrewUnits } from '@/features/crew/challenges';
import { demoCrewConvoys, demoLeaderboard } from '@/features/crew/demo';
import { useArcadeScores } from '@/features/arcade/hooks/useArcadeScores';
import { useConvoyState } from '@/features/convoy';
import { setRideRole } from '@/features/pillion';
import { useHazards, fetchHazards, boundsAround, HAZARD_BY_KIND, hazardColor } from '@/features/hazards';
import { useRiderWeather, readWeather, wet, type WeatherHour, type WeatherRead } from '../lib/riderWeather';
import { useRiderSpot, metresBetween, type Spot } from '../lib/whereRider';
import type { ConsoleCardId } from '../lib/consoleCards';
import { useCalendarStore, dayKey, addDays, dayStart, itemTime, reminderDayFrom, reminderName } from '@/features/calendar/lib/calendarStore';
import { nextCrewPlan } from '@/features/calendar/lib/crewEvents';
import { useDailyForecast } from '@/features/calendar/lib/dailyForecast';
import { ServiceDoneButton } from './ServiceDoneButton';

// ── Shared look ──────────────────────────────────────────────────────────────

/** How long each face of a card stays before the next. */
const FACE_MS = 6000;
const stillMotion = () => isThermal() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * One Console card: a frosted panel with a small accent icon and the card's
 * name, then its faces, one at a time. While the Console is on screen the faces
 * step round every few seconds (a tap on the card steps on and holds off the
 * clock for a while); `pin` holds one face up instead (something happening now:
 * a crew ride to join, rain on its way). All the faces sit in the same cell, so
 * the card is as tall as its tallest and never jumps. Still under Thermal mode
 * and reduced motion (a tap still steps).
 */
function Card({
  icon: Icon,
  label,
  right,
  faces,
  pin,
  active,
  tone,
  top,
}: {
  icon: LucideIcon;
  label: string;
  right?: ReactNode;
  /** Stays put above the faces (the crew card's switcher). */
  top?: ReactNode;
  faces: ReactNode[];
  pin?: number | null;
  active: boolean;
  tone?: 'live';
}) {
  const list = faces.filter(Boolean);
  const [at, setAt] = useState(0);
  const heldUntil = useRef(0);
  const n = list.length;
  const shown = pin != null && pin >= 0 && pin < n ? pin : n ? at % n : 0;
  // Each card keeps its own beat (offset by its name), so the stack doesn't all change at once.
  const offset = useMemo(() => ([...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 5) * 1100, [label]);
  useEffect(() => {
    if (!active || n < 2 || pin != null || stillMotion()) return;
    let t = 0;
    const lead = window.setTimeout(() => {
      t = window.setInterval(() => {
        if (Date.now() < heldUntil.current) return;
        setAt((i) => i + 1);
      }, FACE_MS);
    }, offset);
    return () => {
      window.clearTimeout(lead);
      window.clearInterval(t);
    };
  }, [active, n, pin, offset]);
  if (!n) return null;
  const step = (e: React.MouseEvent) => {
    if (n < 2 || pin != null || (e.target as HTMLElement).closest('button, a')) return;
    haptics.tick();
    heldUntil.current = Date.now() + 15_000;
    setAt(shown + 1);
  };
  return (
    <section
      onClick={step}
      className={cn('rounded-2xl frost border p-3.5', tone === 'live' ? 'border-[hsl(150_60%_50%/0.55)]' : 'border-border/60', n > 1 && pin == null && 'cursor-pointer')}
    >
      <div className="flex items-center gap-1.5 mb-2 min-h-[20px]">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', tone === 'live' ? 'text-[hsl(150_60%_55%)]' : 'text-accent')} />
        <h3 className="flex-1 min-w-0 truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</h3>
        {n > 1 && pin == null && (
          <span className="flex items-center gap-1" aria-hidden>
            {list.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === shown ? 'w-3 bg-accent' : 'w-1.5 bg-foreground/25')} />
            ))}
          </span>
        )}
        {right}
      </div>
      {top}
      <div className="grid">
        {list.map((face, i) => (
          <div
            key={i}
            aria-hidden={i !== shown}
            // The faces not showing can't be tabbed to or pressed.
            {...((i !== shown ? { inert: '' } : {}) as Record<string, string>)}
            className={cn(
              '[grid-area:1/1] min-w-0 transition-[opacity,transform] duration-500 ease-out',
              i === shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5 pointer-events-none',
            )}
          >
            {face}
          </div>
        ))}
      </div>
    </section>
  );
}

function Btn({ children, onClick, primary, href, className }: { children: ReactNode; onClick?: () => void; primary?: boolean; href?: string; className?: string }) {
  const cls = cn(
    'pressable inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl text-[13px] font-semibold whitespace-nowrap',
    primary ? 'bg-accent text-accent-foreground' : 'frost-accent bg-card/60 text-foreground',
    className,
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => haptics.tick()}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() => {
        haptics.tick();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/** A face's main line and the line under it. */
function Lines({ icon: Icon, main, sub, iconClass, big }: { icon?: LucideIcon; main: ReactNode; sub?: ReactNode; iconClass?: string; big?: boolean }) {
  return (
    <div className="flex items-center gap-3 min-h-[44px]">
      {Icon && <Icon className={cn(big ? 'w-9 h-9' : 'w-6 h-6', 'shrink-0', iconClass ?? 'text-accent')} />}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold leading-snug', big ? 'text-2xl font-mono leading-none' : 'text-[15px]')}>{main}</p>
        {sub && <p className={cn('text-xs text-muted-foreground leading-snug', big ? 'mt-1.5' : 'mt-0.5')}>{sub}</p>}
      </div>
    </div>
  );
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function agoText(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (m < 1) return tr("just now");
  if (m < 60) return tr("{0} min ago", [m]);
  const h = Math.floor(m / 60);
  if (h < 24) return tr("{0} h ago", [h]);
  return tr("{0} days ago", [Math.floor(h / 24)]);
}

function lengthText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? tr("{0}h {1}m", [h, m % 60]) : tr("{0} min", [m]);
}

/** Starting a planned route: set it, start the ride, open the map guiding (as Console's route actions do). */
function useStartRoute() {
  const navigate = useNavigate();
  const { startRide, rideState } = useActiveRide();
  return (plan: { destination: { lat: number; lng: number; name?: string; address?: string }; stops: Array<{ lat: number; lng: number; name?: string; address?: string }> } | null) => {
    if (rideState.isActive) return navigate('/ride');
    if (!plan) return;
    setSoloRoute({ destination: plan.destination, stops: plan.stops });
    if (!startRide(false)) return;
    navigate('/ride');
    queueMicrotask(() => openBlacktopMap({ lat: plan.destination.lat, lng: plan.destination.lng, name: plan.destination.name ?? '' }));
  };
}

// ── Weather ──────────────────────────────────────────────────────────────────

function weatherIcon(h: WeatherHour): LucideIcon {
  const c = h.code;
  if (c >= 95) return CloudLightning;
  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return CloudSnow;
  if (c >= 61 || (c >= 80 && c <= 82)) return CloudRain;
  if (c >= 51) return CloudDrizzle;
  if (c >= 45) return CloudFog;
  if (c === 3) return Cloud;
  if (c >= 1) return CloudSun;
  return h.day ? Sun : Moon;
}

/** The one line that answers "should I ride?". */
function verdict(r: WeatherRead): string {
  if (r.wetNow) return r.change ? tr("Wet now, dry from {0}", [clock(r.change.t)]) : tr("Wet for the next 12 hours");
  return r.change ? tr("Dry until {0}, then rain", [clock(r.change.t)]) : tr("Dry for the next 12 hours");
}

const RAIN = 'text-[hsl(205_85%_62%)]';

function WeatherCard({ weather, spot, active }: { weather: WeatherRead | null; spot: Spot | null; active: boolean }) {
  const { updateSetting } = useSettings();
  const radar = (
    <button
      type="button"
      onClick={() => {
        haptics.tick();
        updateSetting('weatherOverlayEnabled', true);
        openBlacktopMap();
      }}
      className="glove-hit inline-flex items-center gap-1 text-[11px] font-semibold text-accent ml-1"
    >
      <Radar className="w-3.5 h-3.5" /> {tr("Radar")}
    </button>
  );
  if (!spot) {
    return (
      <Card
        icon={CloudSun}
        label={tr("Riding weather")}
        active={active}
        faces={[
          <div key="no">
            <p className="text-sm text-muted-foreground">{tr("Open the map once and the weather for where you are shows here.")}</p>
            <div className="mt-2.5">
              <Btn onClick={() => openBlacktopMap()}>
                <MapIcon className="w-4 h-4" /> {tr("Open map")}
              </Btn>
            </div>
          </div>,
        ]}
      />
    );
  }
  if (!weather) {
    return <Card icon={CloudSun} label={tr("Riding weather")} active={active} faces={[<div key="l" className="h-[60px] rounded-xl skeleton-shimmer bg-muted/40" />]} />;
  }
  const Icon = weatherIcon(weather.now);
  const most = Math.max(1, ...weather.ahead.map((h) => h.mm));
  const soon = !weather.wetNow && weather.change && weather.change.t - Date.now() <= 3 * 3600_000;
  const faces: ReactNode[] = [
    // Now: the temperature and the verdict.
    <Lines key="now" big icon={Icon} iconClass={weather.wetNow ? RAIN : 'text-accent'} main={tempText(weather.now.tempC)} sub={<span className="text-sm font-semibold text-foreground">{verdict(weather)}</span>} />,
    // The next twelve hours: a bar for each hour's rain, its time every third hour.
    <div key="hours">
      <div className="flex items-end gap-[3px] h-[52px]" aria-hidden>
        {weather.ahead.map((h, i) => (
          <div key={h.t} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
            <span className="text-[9px] font-mono text-muted-foreground mb-0.5">{i % 3 === 0 ? tempText(h.tempC).replace(/[CF]$/, '') : ' '}</span>
            <div className={cn('w-full rounded-sm', wet(h) ? 'bg-[hsl(205_85%_62%)]' : 'bg-foreground/15')} style={{ height: `${Math.max(10, Math.min(70, (h.mm / most) * 60 + h.prob / 4))}%` }} />
            <span className="text-[9px] text-muted-foreground mt-0.5 font-mono">{i % 3 === 0 ? clock(h.t).slice(0, 2) : ' '}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{tr("Rain over the next 12 hours")}</p>
    </div>,
  ];
  if (weather.window) faces.push(<Lines key="window" icon={Check} main={tr("Best window {0}–{1}", [clock(weather.window.from), clock(weather.window.to)])} sub={tr("Dry, light and not too cold or windy")} />);
  if (weather.gustKmh != null || weather.icy) {
    faces.push(
      <Lines
        key="wind"
        icon={weather.icy ? Snowflake : Wind}
        main={weather.gustKmh != null ? tr("Gusts up to {0}", [windText(weather.gustKmh)]) : tr("Near freezing: watch for ice")}
        sub={weather.gustKmh != null && weather.icy ? tr("Near freezing: watch for ice") : tr("Over the next 6 hours")}
      />,
    );
  }
  if (weather.sunset != null) faces.push(<Lines key="sun" icon={Sunset} main={tr("{0} of daylight left", [lengthText(weather.sunset - Date.now())])} sub={tr("Sunset {0}", [clock(weather.sunset)])} />);
  else if (weather.sunrise != null) faces.push(<Lines key="sun" icon={Sunrise} main={tr("Sunrise {0}", [clock(weather.sunrise)])} sub={tr("Lights on until then")} />);
  return <Card icon={CloudSun} label={tr("Riding weather")} right={radar} active={active} faces={faces} pin={soon ? 0 : null} />;
}

// ── Pick up where you left off ───────────────────────────────────────────────

function openTrips(trips: Trip[]): Trip[] {
  return [...trips].filter((t) => !tripFinished(t) && t.rides.length > 0).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function unriddenRoutes(routes: SavedRoute[], trips: Trip[]): SavedRoute[] {
  const ridden = new Set(trips.map((t) => t.routeId).filter(Boolean));
  return routes.filter((r) => !ridden.has(r.id));
}

function PickUpCard({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const trips = useTrips();
  const routes = useSavedRoutes();
  const start = useStartRoute();
  const faces: ReactNode[] = [];
  for (const trip of openTrips(trips).slice(0, 3)) {
    const total = legCount(trip);
    const from = trip.points[trip.legsDone];
    const to = trip.points[trip.legsDone + 1];
    faces.push(
      <div key={trip.id}>
        <p className="text-[15px] font-semibold truncate">{trip.name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {tr("Leg {0} of {1}", [trip.legsDone + 1, total])}
          {to ? ` · ${(from?.name || tr("Start"))} → ${to.name || tr("destination")}` : ''}
        </p>
        {/* Legs done in the trip's mint, the next in the accent. */}
        <div className="mt-2 flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < trip.legsDone ? 'bg-[hsl(150_55%_50%)]' : i === trip.legsDone ? 'bg-accent' : 'bg-foreground/15')} />
          ))}
        </div>
        <div className="mt-2.5 flex gap-2">
          <Btn primary className="flex-1" onClick={() => start(chooseTrip(trip.id))}>
            <Play className="w-4 h-4" /> {tr("Continue trip")}
          </Btn>
          <Btn onClick={() => navigate(`/trip/${trip.id}`)}>{tr("Details")}</Btn>
        </div>
      </div>,
    );
  }
  for (const route of unriddenRoutes(routes, trips).slice(0, 3)) {
    faces.push(
      <div key={route.id}>
        <p className="text-[15px] font-semibold truncate">{route.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {tr("Saved, not ridden yet")} · {kmText(route.distanceMeters / 1000)}
          {route.via?.length ? ` · ${route.via.length === 1 ? tr("1 stop") : tr("{0} stops", [route.via.length])}` : ''}
        </p>
        <div className="mt-2.5 flex gap-2">
          <Btn primary className="flex-1" onClick={() => start(chooseRouteTrip(route))}>
            <Play className="w-4 h-4" /> {tr("Ride it")}
          </Btn>
        </div>
      </div>,
    );
  }
  return <Card icon={RouteIcon} label={tr("Pick up where you left off")} active={active} faces={faces} />;
}

// ── Your vehicle ─────────────────────────────────────────────────────────────

function VehicleCard({ spot, active }: { spot: Spot | null; active: boolean }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { bikes, activeBike, setActiveBike } = useGarage();
  const stats = useBikeStats(activeBike);
  const parked = useParkedSpot();
  const peaksHidden = usePeaksHidden();
  const showBike = settings.garageEnabled && !!activeBike;
  const showParked = settings.parkedSpotEnabled && !!parked;
  if (!showBike && !showParked) return null;

  const faces: ReactNode[] = [];
  const next = activeBike && bikes.length > 1 ? bikes[(bikes.findIndex((b) => b.id === activeBike.id) + 1) % bikes.length] : null;
  const swap = () => {
    if (!next) return;
    setActiveBike(next.id);
    toast(tr("Now riding {0}", [next.name]));
  };

  if (showBike && activeBike) {
    const photo = activeBike.photos?.hero ? (
      <img src={activeBike.photos.hero} alt="" className="w-14 h-14 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} />
    ) : (
      <div className="w-14 h-14 rounded-xl bg-muted/40 shrink-0" />
    );
    const head = (
      <div className="flex items-center gap-3">
        {photo}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold truncate">{activeBike.name}</p>
          <p className="text-xs text-muted-foreground truncate">{tr("{0} on the clock", [kmText(stats.odometerKm)])}</p>
        </div>
        {next && (
          <Btn onClick={swap} className="h-9 px-2.5">
            <Repeat2 className="w-4 h-4" />
            <span className="sr-only">{tr("Swap to {0}", [next.name])}</span>
          </Btn>
        )}
      </div>
    );
    // Service due first, each item its own face.
    for (const due of dueItems(activeBike.maintenance, stats.odometerKm).slice(0, 3)) {
      const over = due.status.tone === 'over';
      const byTime = due.status.reason === 'time' && due.status.dueInDays != null;
      const line = over
        ? byTime
          ? tr("{0} overdue by {1} days", [due.item.name, -(due.status.dueInDays ?? 0)])
          : tr("{0} overdue by {1}", [due.item.name, kmText(-due.status.dueInKm)])
        : byTime
          ? tr("{0} due in {1} days", [due.item.name, due.status.dueInDays ?? 0])
          : tr("{0} due in {1}", [due.item.name, kmText(due.status.dueInKm)]);
      faces.push(
        <div key={`due-${due.item.id}`}>
          {head}
          <div className={cn('mt-2.5 rounded-xl px-3 py-1.5 flex items-center gap-2', over ? 'bg-destructive/15' : 'bg-[hsl(38_92%_50%/0.14)]')}>
            <Wrench className={cn('w-4 h-4 shrink-0', over ? 'text-destructive' : 'text-[hsl(38_92%_55%)]')} />
            <button
              type="button"
              onClick={() => {
                haptics.tick();
                navigate(`/garage?tab=maint&bike=${activeBike.id}`);
              }}
              className="flex-1 min-w-0 text-left text-[13px] font-semibold leading-snug min-h-[36px]"
            >
              {line}
            </button>
            <ServiceDoneButton bike={activeBike} item={due.item} odometerKm={stats.odometerKm} />
          </div>
        </div>,
      );
    }
    // What the vehicle has done (all the card has when nothing's due).
    faces.push(
      <div key="stats">
        {head}
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/30 py-1.5">
            <p className="font-mono text-sm font-semibold">{stats.totalRides}</p>
            <p className="text-[10px] text-muted-foreground">{tr("Rides")}</p>
          </div>
          <div className="rounded-xl bg-muted/30 py-1.5">
            <p className="font-mono text-sm font-semibold truncate px-1">{milesText(stats.longestRideMi)}</p>
            <p className="text-[10px] text-muted-foreground">{tr("Longest")}</p>
          </div>
          <div className="rounded-xl bg-muted/30 py-1.5">
            <p className="font-mono text-sm font-semibold truncate px-1">{peaksHidden ? PEAK_HIDDEN : speedText(stats.topSpeedMph)}</p>
            <p className="text-[10px] text-muted-foreground">{tr("Top speed")}</p>
          </div>
        </div>
      </div>,
    );
  }
  if (showParked && parked) {
    const away = spot?.live ? metresBetween(spot, parked) : null;
    const level = parkedLevelText(parked);
    faces.push(
      <div key="parked">
        <Lines
          icon={CircleParking}
          main={tr("Parked {0}", [agoText(parked.at)])}
          sub={[away != null ? tr("{0} away", [metresText(away)]) : null, level].filter(Boolean).join(' · ') || tr("Where your last ride ended")}
        />
        <div className="mt-2.5">
          <Btn href={walkBackUrl(parked)} className="w-full">
            <Footprints className="w-4 h-4" /> {tr("Walk back")}
          </Btn>
        </div>
      </div>,
    );
  }
  return <Card icon={Wrench} label={tr("Your vehicle")} active={active} right={<ArmButton />} faces={faces} />;
}

/** The anti-theft alarm, slim enough for a card's header (a 48 px target all the same). */
function ArmButton() {
  return (
    <button
      type="button"
      aria-label={tr("Arm the anti-theft alarm")}
      onClick={() => {
        haptics.tick();
        void armAlarm();
      }}
      className="glove-hit ml-1 -my-1 inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-[hsl(var(--burn)/0.4)] bg-[hsl(var(--burn)/0.1)] text-[11px] font-semibold text-[hsl(var(--burn))]"
    >
      <Siren className="w-3.5 h-3.5" /> {tr("Alarm")}
    </button>
  );
}

// ── Your week ────────────────────────────────────────────────────────────────

function mondayOf(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const WEEK = 7 * 86_400_000;

function WeekCard({ active }: { active: boolean }) {
  const { rides } = useRideHistory();
  const { settings } = useSettings();
  const { terms } = useExperience();
  const s = useMemo(() => {
    const done = rides.filter((r) => r.endedAt);
    if (!done.length) return null;
    const now = Date.now();
    const thisWeek = mondayOf(now);
    const within = (from: number, to: number) => done.filter((r) => { const t = Date.parse(r.startedAt); return t >= from && t < to; });
    const dist = (list: typeof done) => list.reduce((n, r) => n + (r.distance || 0), 0);
    const mine = within(thisWeek, now + 1);
    const weeks = new Set(done.map((r) => mondayOf(Date.parse(r.startedAt))));
    let streak = 0;
    for (let w = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK; weeks.has(w); w -= WEEK) streak++;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todays = done.filter((r) => Date.parse(r.startedAt) >= today.getTime());
    const night = todays.some((r) => { const h = new Date(r.startedAt).getHours(); return h >= 20 || h < 5; });
    return {
      mine: dist(mine),
      count: mine.length,
      time: mine.reduce((n, r) => n + (r.duration || 0), 0),
      last: dist(within(thisWeek - WEEK, thisWeek)),
      streak,
      ridesToday: todays.length,
      night,
      longest: Math.max(...done.map((r) => r.distance || 0)),
      hour: new Date(now).getHours(),
    };
  }, [rides]);
  if (!s) return null;

  const faces: ReactNode[] = [];
  const ahead = s.mine - s.last;
  const pct = s.last > 0 ? Math.min(1, s.mine / s.last) : s.mine > 0 ? 1 : 0;
  const R = 22;
  const C = 2 * Math.PI * R;
  faces.push(
    <div key="ring" className="flex items-center gap-3.5">
      <svg viewBox="0 0 56 56" className="w-14 h-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={R} fill="none" stroke="hsl(var(--foreground) / 0.12)" strokeWidth="6" />
        <circle cx="28" cy="28" r={R} fill="none" stroke="hsl(var(--accent))" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold font-mono leading-tight">{milesText(s.mine)}</p>
        <p className="text-xs text-muted-foreground">
          {terms.car
            ? s.count === 1 ? tr("1 drive this week") : tr("{0} drives this week", [s.count])
            : s.count === 1 ? tr("1 ride this week") : tr("{0} rides this week", [s.count])}
        </p>
      </div>
    </div>,
  );
  faces.push(
    <Lines
      key="vs"
      icon={s.last === 0 || ahead >= 0 ? TrendingUp : TrendingDown}
      iconClass={s.last > 0 && ahead < 0 ? 'text-muted-foreground' : 'text-accent'}
      main={s.last === 0 ? tr("Nothing last week to beat") : ahead >= 0 ? tr("{0} more than last week", [milesText(ahead)]) : tr("{0} to match last week", [milesText(-ahead)])}
      sub={tr("Last week: {0}", [milesText(s.last)])}
    />,
  );
  if (s.time > 0) faces.push(<Lines key="time" icon={CalendarDays} main={tr("{0} in the saddle this week", [lengthText(s.time * 1000)])} sub={tr("Since Monday")} />);
  if (s.streak >= 2) faces.push(<Lines key="streak" icon={Flame} iconClass="text-[hsl(var(--burn))]" main={tr("{0} weeks in a row", [s.streak])} sub={tr("Keep it going this week")} />);
  // The badge most within reach today (badges only with collecting on).
  if (settings.collectiblesEnabled) {
    let badge: string | null = null;
    if (s.ridesToday >= 1 && s.ridesToday < 3) {
      const left = 3 - s.ridesToday;
      badge = terms.car
        ? left === 1 ? tr("1 more drive today") : tr("{0} more drives today", [left])
        : left === 1 ? tr("1 more ride today") : tr("{0} more rides today", [left]);
      faces.push(<Lines key="badge" icon={Award} iconClass="text-[hsl(var(--lava,var(--accent)))]" main="Always Out" sub={badge} />);
    } else if (s.hour >= 16 && !s.night) {
      faces.push(<Lines key="badge" icon={Award} iconClass="text-[hsl(var(--lava,var(--accent)))]" main="Night Owl" sub={terms.car ? tr("Drive after 20:00 tonight") : tr("Ride after 20:00 tonight")} />);
    } else if (s.longest < 150) {
      faces.push(<Lines key="badge" icon={Award} iconClass="text-[hsl(var(--lava,var(--accent)))]" main="Hard Ass" sub={tr("{0} in one go (your longest is {1})", [milesText(150), milesText(s.longest)])} />);
    }
  }
  return <Card icon={TrendingUp} label={tr("Your week")} active={active} faces={faces} />;
}

// ── Crew live ────────────────────────────────────────────────────────────────

interface ConvoyRow {
  id: string;
  code: string;
  name: string;
  leader_name: string;
  member_count: number;
  is_riding: boolean;
  destination_name: string;
}
interface BoardRow {
  display_name: string;
  total_distance: number;
}
const RANK_KEY = 'blacktop_console_crew_rank';

function CrewCard({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const crew = useCrew();
  const { settings } = useSettings();
  const { enabled: demo } = useDemoMode();
  const { rides, burnedTotals } = useRideHistory();
  const { scores } = useArcadeScores();
  const peaksHidden = usePeaksHidden();
  const { joinConvoy } = useConvoyState();
  const [joining, setJoining] = useState(false);
  const units: CrewUnits = { distance: settings.distanceUnit, speed: settings.speedUnit };
  // Read only while the Console is on screen, a minute apart (the crew pages' own pace).
  const { data } = useQuery({
    queryKey: ['console-crew', crew.code, demo],
    enabled: active && !!crew.code && settings.blacktopWorldEnabled,
    refetchInterval: active ? 60_000 : false,
    queryFn: async () => {
      if (demo) return { convoys: demoCrewConvoys(crew.code) as ConvoyRow[], board: demoLeaderboard(crew.code) as BoardRow[] };
      const [c, b] = await Promise.all([
        (supabase as any).rpc('list_crew_convoys', { _crew_code: crew.code }),
        (supabase as any).rpc('list_crew_leaderboard', { _crew_code: crew.code }),
      ]);
      return { convoys: (c.data ?? []) as ConvoyRow[], board: (b.data ?? []) as BoardRow[] };
    },
  });
  const mine = useMemo(() => crewTotals(rides, burnedTotals, scores).total_distance, [rides, burnedTotals, scores]);
  const week = useMemo(() => weekStats(rides), [rides]);
  const riding = (data?.convoys ?? []).filter((c) => c.is_riding);
  const open = (data?.convoys ?? []).filter((c) => !c.is_riding);
  const board = data?.board ?? [];
  const rank = board.length > 1 ? 1 + board.filter((r) => r.total_distance > mine + 0.05).length : null;

  // Where the rider stood the last time they looked: up or down since.
  // (Kept per crew, so switching between them shows each one's own movement.)
  const [moved, setMoved] = useState(0);
  const checked = useRef('');
  useEffect(() => {
    if (!rank || !active || checked.current === crew.code) return;
    checked.current = crew.code;
    try {
      const raw = JSON.parse(localStorage.getItem(RANK_KEY) || '{}') as Record<string, number>;
      const last = raw && typeof raw === 'object' ? raw[crew.code] : undefined;
      setMoved(typeof last === 'number' ? last - rank : 0);
      localStorage.setItem(RANK_KEY, JSON.stringify({ ...(raw && typeof raw === 'object' ? raw : {}), [crew.code]: rank }));
    } catch {
      /* this launch only */
    }
  }, [rank, active, crew.code]);

  if (!settings.blacktopWorldEnabled || !crew.code) return null;

  const join = async (code: string) => {
    if (joining || demoBlocked()) return;
    setJoining(true);
    try {
      if (await joinConvoy(code)) {
        let pillion = false;
        try {
          pillion = localStorage.getItem('bt.join_role') === 'pillion';
        } catch {
          /* storage unavailable */
        }
        setRideRole(pillion ? 'pillion' : 'operator');
        navigate('/lobby');
      }
    } finally {
      setJoining(false);
    }
  };

  const convoyFace = (c: ConvoyRow, live: boolean) => (
    <div key={c.id} className="flex items-center gap-2 min-h-[44px]">
      {live ? (
        <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-[hsl(150_70%_50%)] opacity-60 motion-safe:animate-ping" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-[hsl(150_70%_50%)]" />
        </span>
      ) : (
        <Users className="w-5 h-5 text-accent shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold truncate">{live ? tr("{0} is riding", [c.leader_name || c.name]) : tr("{0} is in a lobby", [c.leader_name || c.name])}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {[c.member_count === 1 ? tr("1 rider") : tr("{0} riders", [c.member_count]), c.destination_name ? tr("to {0}", [c.destination_name]) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Btn onClick={() => void join(c.code)} primary className="h-9 px-3">
        {tr("Join")}
      </Btn>
      {live && (
        <Btn onClick={() => navigate(`/spectate/${c.id}`)} className="h-9 px-2.5">
          <Eye className="w-4 h-4" />
          <span className="sr-only">{tr("Spectate")}</span>
        </Btn>
      )}
    </div>
  );

  // In more than one crew: a chip for each, the active one lit; picking one makes it the active crew everywhere.
  const switcher =
    crew.crews.length > 1 ? (
      <div className="flex flex-wrap gap-1.5 mb-2.5" role="radiogroup" aria-label={tr("Your crews")}>
        {crew.crews.map((c) => {
          const on = c.code === crew.code;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (on) return;
                haptics.tick();
                setMoved(0);
                setActiveCrew(c.code);
              }}
              className={cn(
                'tall-hit h-8 max-w-[45%] px-3 rounded-lg text-[12px] font-semibold truncate border transition-colors',
                on ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 text-foreground border-border/60',
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    ) : null;

  // A crew ride you can join takes the card; otherwise it steps through lobbies, the board and this week's challenges.
  if (riding.length) {
    return <Card key={crew.code} icon={Users} tone="live" label={tr("Crew live · {0}", [crew.name])} active={active} top={switcher} faces={riding.slice(0, 3).map((c) => convoyFace(c, true))} />;
  }
  const faces: ReactNode[] = open.slice(0, 2).map((c) => convoyFace(c, false));
  if (rank) {
    faces.push(
      <button
        key="rank"
        type="button"
        onClick={() => {
          haptics.tick();
          navigate('/crew/leaderboard');
        }}
        className="w-full flex items-center gap-3 text-left min-h-[44px]"
      >
        <Trophy className="w-6 h-6 text-accent shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold">{tr("#{0} of {1} on distance", [rank, board.length])}</span>
          <span className="block text-xs text-muted-foreground">{tr("Your crew's board")}</span>
        </span>
        {moved !== 0 && (
          <span className={cn('text-[11px] font-semibold inline-flex items-center gap-0.5', moved > 0 ? 'text-[hsl(150_60%_55%)]' : 'text-destructive')}>
            {moved > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {moved > 0 ? tr("up {0}", [moved]) : tr("down {0}", [-moved])}
          </span>
        )}
      </button>,
    );
  }
  const left = daysLeftInWeek();
  for (const c of challengesForWeek()) {
    const peak = c.metric === 'max_lean' || c.metric === 'top_speed' || c.metric === 'corner_score';
    const value = week[c.metric];
    const shown = peak && (peaksHidden || value == null) ? PEAK_HIDDEN : challengeScore(c.metric, value ?? 0, units);
    const pct = !peak || !peaksHidden ? Math.min(1, (value ?? 0) / c.target) : 0;
    faces.push(
      <button
        key={c.id}
        type="button"
        onClick={() => {
          haptics.tick();
          navigate('/crew/challenges');
        }}
        className="w-full text-left min-h-[44px]"
      >
        <span className="flex items-center gap-3">
          <Target className="w-6 h-6 text-accent shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold truncate">{c.title}</span>
            <span className="block text-xs text-muted-foreground truncate">
              {tr("You: {0}", [shown])} · {left === 1 ? tr("1 day left") : tr("{0} days left", [left])}
            </span>
          </span>
        </span>
        <span className="mt-2 block h-1.5 rounded-full bg-foreground/15 overflow-hidden" aria-hidden>
          <span className="block h-full bg-accent rounded-full" style={{ width: `${pct * 100}%` }} />
        </span>
      </button>,
    );
  }
  // Nothing for this crew yet: still the switcher, so another crew can be picked.
  if (!faces.length && switcher) faces.push(<p key="quiet" className="text-xs text-muted-foreground min-h-[44px] flex items-center">{tr("Nothing happening in this crew yet.")}</p>);
  return <Card key={crew.code} icon={Users} label={tr("Crew · {0}", [crew.name])} active={active} top={switcher} faces={faces} />;
}

// ── Hazards near you ─────────────────────────────────────────────────────────

const NEAR_M = 8000;

function HazardsCard({ spot, active }: { spot: Spot | null; active: boolean }) {
  const all = useHazards();
  const lastFetch = useRef(0);
  useEffect(() => {
    if (!active || !spot || Date.now() - lastFetch.current < 120_000) return;
    lastFetch.current = Date.now();
    void fetchHazards(boundsAround(spot, NEAR_M));
  }, [active, spot]);
  if (!spot) return null;
  const now = Date.now();
  const near = all
    .filter((h) => h.expiresAt > now)
    .map((h) => ({ h, d: metresBetween(spot, h) }))
    .filter((x) => x.d <= NEAR_M)
    .sort((a, b) => a.d - b.d);
  if (!near.length) return null;
  // The count first, then the nearest few one at a time.
  const faces: ReactNode[] = [
    <div key="sum">
      <Lines
        icon={TriangleAlert}
        main={near.length === 1 ? tr("1 report within {0}", [metresText(NEAR_M)]) : tr("{0} reports within {1}", [near.length, metresText(NEAR_M)])}
        sub={tr("Reported by riders near you")}
      />
      <div className="mt-2.5">
        <Btn onClick={() => openBlacktopMap()} className="w-full">
          <MapIcon className="w-4 h-4" /> {tr("Show on the map")}
        </Btn>
      </div>
    </div>,
  ];
  for (const { h, d } of near.slice(0, 3)) {
    const type = HAZARD_BY_KIND[h.kind];
    const Icon = type?.icon ?? TriangleAlert;
    faces.push(
      <div key={h.id}>
        <div className="flex items-center gap-3 min-h-[44px]">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: hazardColor(h.kind) }}>
            <Icon className="w-5 h-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold truncate">{type?.label ?? h.kind}</p>
            <p className="text-xs text-muted-foreground">{tr("{0} away · reported {1}", [metresText(d), agoText(h.createdAt)])}</p>
          </div>
        </div>
        <div className="mt-2.5">
          <Btn onClick={() => openBlacktopMap()} className="w-full">
            <MapIcon className="w-4 h-4" /> {tr("Show on the map")}
          </Btn>
        </div>
      </div>,
    );
  }
  return <Card icon={TriangleAlert} label={tr("Hazards near you")} active={active} faces={faces} />;
}

// ── Up next (the Blacktop Calendar) ──

/** The rider's next few things on the calendar (14 days), each with that day's forecast; a tap opens the day. */
function UpNextCard({ spot, active }: { spot: Spot | null; active: boolean }) {
  const navigate = useNavigate();
  const { items } = useCalendarStore();
  const forecast = useDailyForecast(spot, active);
  const today = dayKey(Date.now());
  const until = addDays(today, 14);
  const lang = document.documentElement.lang || undefined;
  const next: Array<{ key: string; day: string; at: number; title: string; sub?: string }> = [];
  for (const i of items) {
    const day = i.kind === 'reminder' ? reminderDayFrom(i, today) : i.day;
    if (day < today || day > until) continue;
    const at = itemTime({ day, time: i.time });
    if (day === today && i.time && at < Date.now() - 3600_000) continue;
    const title = i.kind === 'reminder' ? (i.type === 'other' ? i.title : reminderName(i)) : i.kind === 'track' ? tr("Track Day: {0}", [i.circuit]) : i.title;
    next.push({ key: i.id, day, at, title, sub: i.kind === 'plan' ? i.place?.name : i.kind === 'track' ? tr("{0} of {1} packed", [i.packing.filter((p) => p.done).length, i.packing.length]) : undefined });
  }
  const crew = nextCrewPlan();
  if (crew && Date.parse(crew.starts_at) <= dayStart(until).getTime()) {
    next.push({ key: crew.id, day: dayKey(Date.parse(crew.starts_at)), at: Date.parse(crew.starts_at), title: crew.title, sub: [crew.place_name, crew.going === 1 ? tr("1 going") : tr("{0} going", [crew.going])].filter(Boolean).join(' · ') });
  }
  next.sort((a, b) => a.at - b.at);
  const faces = next.slice(0, 4).map((n) => {
    const w = forecast.get(n.day);
    const when = n.day === today ? tr("Today") : n.day === addDays(today, 1) ? tr("Tomorrow") : dayStart(n.day).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' });
    return (
      <button
        key={n.key}
        type="button"
        onClick={() => {
          haptics.tick();
          navigate(`/calendar?day=${n.day}`);
        }}
        className="w-full text-left flex items-center gap-3 min-h-[44px]"
      >
        <CalendarDays className="w-6 h-6 text-accent shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold truncate">{n.title}</span>
          <span className="block text-xs text-muted-foreground truncate">
            {[when, clock(n.at), n.sub, w ? (w.verdict === 'dry' ? tr("Dry") : w.verdict === 'showers' ? tr("Showers") : w.verdict === 'wet' ? tr("Wet") : w.verdict === 'gusty' ? tr("Gusty") : tr("Icy")) : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    );
  });
  return <Card icon={CalendarDays} label={tr("Up next")} active={active} faces={faces} />;
}

/** A plan for today, when there is one: its own suggestion face, with Start. */
function useTodaysPlan() {
  const { items } = useCalendarStore();
  const today = dayKey(Date.now());
  return items.find((i) => i.kind === 'plan' && i.day === today && itemTime(i) > Date.now() - 2 * 3600_000) ?? null;
}

// ── Suggestion ───────────────────────────────────────────────────────────────

function SuggestionCard({ weather, active }: { weather: WeatherRead | null; active: boolean }) {
  const navigate = useNavigate();
  const trips = useTrips();
  const routes = useSavedRoutes();
  const { terms } = useExperience();
  const { rideState } = useActiveRide();
  const start = useStartRoute();
  const todays = useTodaysPlan();
  if (!weather || rideState.isActive) return null;
  const now = Date.now();
  const trip = openTrips(trips)[0] ?? null;
  const faces: ReactNode[] = [];
  // Something planned for today comes first, with the weather it's going to get.
  if (todays && todays.kind === 'plan') {
    const route = todays.routeId ? routes.find((r) => r.id === todays.routeId) : null;
    const go = todays.tripId ? () => start(chooseTrip(todays.tripId!)) : route ? () => start(chooseRouteTrip(route)) : todays.place ? () => start({ destination: todays.place!, stops: [] }) : null;
    const weatherLine = weather.wetNow ? tr("wet now") : weather.change ? tr("dry until {0}", [clock(weather.change.t)]) : tr("dry all day");
    faces.push(
      <div key="today" className="flex items-center gap-3 min-h-[44px]">
        <p className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{tr("Today at {0}: {1} ({2})", [todays.time ?? '', todays.title, weatherLine])}</p>
        {go && (
          <Btn primary onClick={go} className="shrink-0">
            {tr("Start")}
          </Btn>
        )}
      </div>,
    );
  }
  const face = (key: string, text: string, go?: { label: string; run: () => void }) => (
    <div key={key} className="flex items-center gap-3 min-h-[44px]">
      <p className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{text}</p>
      {go && (
        <Btn primary onClick={go.run} className="shrink-0">
          {go.label}
        </Btn>
      )}
    </div>
  );
  if (!weather.wetNow && weather.window && weather.window.from <= now + 3600_000) {
    const until = clock(weather.window.to);
    if (trip) faces.push(face('trip', tr("Dry until {0}. Carry on with {1}?", [until, trip.name]), { label: tr("Continue trip"), run: () => start(chooseTrip(trip.id)) }));
    // A few saved routes, a different one first each day.
    const day = Math.floor(now / 86_400_000);
    const picks = routes.length ? [0, 1].map((k) => routes[(day + k) % routes.length]).filter((r, i, a) => a.indexOf(r) === i) : [];
    for (const route of picks) {
      faces.push(
        face(`route-${route.id}`, terms.car ? tr("Dry until {0}. Drive {1}?", [until, route.name]) : tr("Dry until {0}. Ride {1}?", [until, route.name]), {
          label: terms.car ? tr("Drive it") : tr("Ride it"),
          run: () => start(chooseRouteTrip(route)),
        }),
      );
    }
    if (!faces.length) {
      faces.push(face('go', terms.car ? tr("Dry until {0}: a good time for a drive.", [until]) : tr("Dry until {0}: a good time for a ride.", [until]), { label: tr("Plan a route"), run: () => navigate('/solo-lobby') }));
    }
  } else if (!weather.wetNow && weather.change) {
    faces.push(face('rain', terms.car ? tr("Rain from {0}. Go now, or wait for it to pass.", [clock(weather.change.t)]) : tr("Rain from {0}. Ride now, or wait for it to pass.", [clock(weather.change.t)])));
  } else if (weather.wetNow && weather.change) {
    faces.push(face('later', tr("Wet now, dry from {0}. Plan for then?", [clock(weather.change.t)]), { label: tr("Plan a route"), run: () => navigate('/solo-lobby') }));
  }
  if (!faces.length) return null;
  return <Card icon={Lightbulb} label={tr("Suggestion")} active={active} faces={faces} />;
}

// ── The stack ────────────────────────────────────────────────────────────────

/**
 * The Console's live cards, one to a row, in the order given (hidden ones left
 * out). Each says nothing when it has nothing to say. Anything that asks a
 * server does so only while the Console is on screen (`active`).
 */
export function ConsoleCards({ order, active }: { order: ConsoleCardId[]; active: boolean }) {
  const spot = useRiderSpot(active);
  const raw = useRiderWeather(spot, active);
  // Read again each minute while on screen, so "until 16:00" and the daylight left stay right.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [active]);
  const weather = useMemo(() => readWeather(raw, now), [raw, now]);
  const card = (id: ConsoleCardId) => {
    switch (id) {
      case 'suggest':
        return <SuggestionCard key={id} weather={weather} active={active} />;
      case 'upnext':
        return <UpNextCard key={id} spot={spot} active={active} />;
      case 'weather':
        return <WeatherCard key={id} weather={weather} spot={spot} active={active} />;
      case 'pickup':
        return <PickUpCard key={id} active={active} />;
      case 'vehicle':
        return <VehicleCard key={id} spot={spot} active={active} />;
      case 'week':
        return <WeekCard key={id} active={active} />;
      case 'crew':
        return <CrewCard key={id} active={active} />;
      case 'hazards':
        return <HazardsCard key={id} spot={spot} active={active} />;
    }
  };
  return <div className="flex flex-col gap-2.5">{order.map(card)}</div>;
}
