import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Sun, CloudSun, CloudRain, CloudDrizzle, Wind, Snowflake, Sunrise, Sunset, Plus, Trash2, Play, Check, X, HelpCircle, Wrench, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { tempText, windText } from '@/lib/units';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useActiveRide, setSoloRoute } from '@/features/ride';
import { chooseRouteTrip, chooseTrip } from '@/features/ride/lib/trips';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { useGarage, useBikeStats } from '@/features/garage';
import { openRescueDrill } from '@/features/rescue';
import { ServiceDoneButton } from '@/features/console/components/ServiceDoneButton';
import { removeCalendarItem, updateCalendarItem, dayStart, type TrackItem } from '../lib/calendarStore';
import { useCrewEventActions, type RsvpStatus } from '../lib/crewEvents';
import type { DayWeather, DayVerdict } from '../lib/dailyForecast';
import type { CalEvent } from '../lib/sources';

const VERDICT_ICON: Record<DayVerdict, LucideIcon> = { dry: Sun, showers: CloudDrizzle, wet: CloudRain, gusty: Wind, icy: Snowflake };
export const verdictIcon = (v: DayVerdict) => VERDICT_ICON[v] ?? CloudSun;

export function verdictText(v: DayVerdict): string {
  switch (v) {
    case 'dry':
      return tr("Dry");
    case 'showers':
      return tr("Showers");
    case 'wet':
      return tr("Wet");
    case 'gusty':
      return tr("Gusty");
    default:
      return tr("Icy");
  }
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Small({ children, onClick, primary, danger }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptics.tick();
        onClick();
      }}
      className={cn(
        'pressable h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap',
        primary ? 'bg-accent text-accent-foreground' : danger ? 'border border-destructive/40 text-destructive' : 'frost-accent bg-card/60',
      )}
    >
      {children}
    </button>
  );
}

/** One thing on the day, with what can be done about it. */
function EventRow({ e }: { e: CalEvent }) {
  const navigate = useNavigate();
  const routes = useSavedRoutes();
  const { startRide, rideState } = useActiveRide();
  const { profile } = useProfile();
  const { bikes } = useGarage();
  const crew = useCrewEventActions();
  const Icon = e.icon;
  const bike = e.service ? bikes.find((b) => b.id === e.service!.bikeId) ?? null : null;
  const stats = useBikeStats(bike);

  const start = (plan: { destination: { lat: number; lng: number; name?: string; address?: string }; stops: Array<{ lat: number; lng: number; name?: string }> } | null) => {
    if (rideState.isActive) return navigate('/ride');
    if (!plan) return;
    setSoloRoute({ destination: plan.destination, stops: plan.stops });
    if (!startRide(false)) return;
    navigate('/ride');
    queueMicrotask(() => openBlacktopMap({ lat: plan.destination.lat, lng: plan.destination.lng, name: plan.destination.name ?? '' }));
  };

  const actions: React.ReactNode[] = [];
  if (e.rideId) actions.push(<Small key="open" onClick={() => navigate(`/ride/${e.rideId}`)}>{tr("Open")}</Small>);
  if (e.tripId) actions.push(<Small key="trip" onClick={() => navigate(`/trip/${e.tripId}`)}>{tr("See trip")}</Small>);
  if (e.kind === 'plan' && e.item?.kind === 'plan') {
    const p = e.item;
    const route = p.routeId ? routes.find((r) => r.id === p.routeId) : null;
    // Chosen only when pressed: choosing a trip or route arms it for the next ride.
    const plan = () => (p.tripId ? chooseTrip(p.tripId) : route ? chooseRouteTrip(route) : p.place ? { destination: p.place, stops: [] } : null);
    if (p.tripId || route || p.place) actions.push(<Small key="go" primary onClick={() => start(plan())}><Play className="w-3.5 h-3.5" />{tr("Start")}</Small>);
    actions.push(<Small key="del" danger onClick={() => removeCalendarItem(p.id)}><Trash2 className="w-3.5 h-3.5" />{tr("Remove")}</Small>);
  }
  if (e.kind === 'reminder' && e.item) {
    const id = e.item.id;
    actions.push(<Small key="del" danger onClick={() => removeCalendarItem(id)}><Trash2 className="w-3.5 h-3.5" />{tr("Remove")}</Small>);
  }
  if (e.kind === 'business') actions.push(<Small key="ws" onClick={() => navigate('/', { state: { deck: 'doorway' } })}>{tr("Workspace")}</Small>);
  if (e.kind === 'service' && e.service && bike) {
    const item = bike.maintenance.find((m) => m.id === e.service!.itemId);
    actions.push(<Small key="maint" onClick={() => navigate(`/garage?tab=maint&bike=${bike.id}`)}><Wrench className="w-3.5 h-3.5" />{tr("Maintenance")}</Small>);
    if (item) actions.push(<ServiceDoneButton key="done" bike={bike} item={item} odometerKm={stats.odometerKm} />);
  }
  if (e.kind === 'serviced' || e.kind === 'logbook') actions.push(<Small key="g" onClick={() => navigate('/garage')}>{tr("Garage")}</Small>);
  if (e.kind === 'challenge' || e.kind === 'crewGoal') actions.push(<Small key="c" onClick={() => navigate('/crew/challenges')}>{tr("See board")}</Small>);
  if (e.kind === 'safety' && e.id.startsWith('drill-due')) actions.push(<Small key="drill" primary onClick={openRescueDrill}><ShieldCheck className="w-3.5 h-3.5" />{tr("Start the drill")}</Small>);
  if (e.kind === 'safety' && e.id.startsWith('check:')) actions.push(<Small key="s" onClick={() => navigate('/settings')}>{tr("Safety settings")}</Small>);

  const answer = async (status: RsvpStatus) => {
    if (!e.crewEvent) return;
    const err = await crew.rsvp(e.crewEvent.id, status, profile.name || '');
    if (err && err !== 'demo') toast.error(tr("Couldn't save your answer"));
  };

  return (
    <li className="rounded-2xl frost border border-border/60 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${e.color} 18%, transparent)` }}>
          <Icon className="w-4 h-4" style={{ color: e.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug break-words">
            {e.at && e.kind !== 'memory' ? <span className="font-mono text-muted-foreground mr-1.5">{clock(e.at)}</span> : null}
            {e.title}
            {e.estimate && <span className="ml-1 text-muted-foreground">≈</span>}
          </p>
          {e.sub && <p className="text-xs text-muted-foreground leading-snug mt-0.5 break-words">{e.sub}</p>}
          {e.crewEvent && e.crewEvent.going_names.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.crewEvent.going_names.join(', ')}</p>
          )}
        </div>
      </div>
      {/* A Track Day booking's packing list. */}
      {e.kind === 'track' && e.item?.kind === 'track' && <Packing item={e.item} />}
      {/* A crew plan: going, maybe or can't. */}
      {e.crewEvent && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr("Are you going?")}>
          {(
            [
              ['going', tr("Going"), Check],
              ['maybe', tr("Maybe"), HelpCircle],
              ['no', tr("Can't"), X],
            ] as const
          ).map(([s, label, I]) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={e.crewEvent!.my_status === s}
              onClick={() => void answer(s)}
              className={cn(
                'h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border',
                e.crewEvent!.my_status === s ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60',
              )}
            >
              <I className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
          {dayStart(e.day).toDateString() === new Date().toDateString() && (
            <Small onClick={() => navigate(e.crewEvent!.mine ? '/create-convoy' : '/crew/convoys')}>{e.crewEvent.mine ? tr("Start the convoy") : tr("Crew convoys")}</Small>
          )}
          {e.crewEvent.mine && <Small danger onClick={() => void crew.remove(e.crewEvent!.id)}><Trash2 className="w-3.5 h-3.5" />{tr("Remove")}</Small>}
        </div>
      )}
      {actions.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{actions}</div>}
    </li>
  );
}

function Packing({ item }: { item: TrackItem }) {
  const navigate = useNavigate();
  return (
    <div className="mt-2.5">
      <ul className="grid grid-cols-2 gap-1">
        {item.packing.map((p, n) => (
          <li key={p.item}>
            <button
              type="button"
              onClick={() => updateCalendarItem(item.id, { packing: item.packing.map((x, j) => (j === n ? { ...x, done: !x.done } : x)) } as Partial<TrackItem>)}
              className={cn('w-full min-h-[36px] text-left text-xs rounded-lg px-2 py-1.5 flex items-center gap-1.5 border', p.done ? 'border-[hsl(150_55%_50%/0.5)] text-foreground' : 'border-border/60 text-muted-foreground')}
            >
              <Check className={cn('w-3.5 h-3.5 shrink-0', p.done ? 'text-[hsl(150_55%_55%)]' : 'opacity-25')} /> {p.item}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-1.5">
        <Small onClick={() => navigate('/track')}>{tr("Track Day")}</Small>
        <Small danger onClick={() => removeCalendarItem(item.id)}><Trash2 className="w-3.5 h-3.5" />{tr("Remove")}</Small>
      </div>
    </div>
  );
}

/** A day: its weather and daylight, then everything on it, and Add. */
export function DayPanel({
  day,
  events,
  weather,
  sun,
  onAdd,
}: {
  day: string;
  events: CalEvent[];
  weather: DayWeather | null;
  sun: { rise: number | null; set: number | null } | null;
  onAdd: () => void;
}) {
  const { settings } = useSettings();
  const lang = document.documentElement.lang || undefined;
  const W = weather ? verdictIcon(weather.verdict) : null;
  void settings;
  return (
    <section className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {dayStart(day).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        <button type="button" onClick={onAdd} className="glove-hit inline-flex items-center gap-1 text-xs font-semibold text-accent">
          <Plus className="w-3.5 h-3.5" /> {tr("Add")}
        </button>
      </div>
      {(weather || sun?.rise) && (
        <div className="rounded-2xl frost border border-border/60 px-3 py-2.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {weather && W && (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <W className="w-4 h-4 text-accent" /> {verdictText(weather.verdict)} · {tempText(weather.maxC)} / {tempText(weather.minC)}
            </span>
          )}
          {weather && weather.prob > 0 && <span className="text-muted-foreground">{tr("{0}% chance of rain", [Math.round(weather.prob)])}</span>}
          {weather && weather.gustKmh >= 40 && <span className="text-muted-foreground">{tr("Gusts up to {0}", [windText(weather.gustKmh)])}</span>}
          {sun?.rise && sun.set && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Sunrise className="w-3.5 h-3.5" /> {clock(sun.rise)} <Sunset className="w-3.5 h-3.5 ml-1" /> {clock(sun.set)}
            </span>
          )}
        </div>
      )}
      {events.length === 0 ? (
        <p className="rounded-2xl frost border border-border/60 p-3.5 text-sm text-muted-foreground">{tr("Nothing on this day yet.")}</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
