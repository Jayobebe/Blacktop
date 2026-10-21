import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, Play, Trash2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { BTLogo } from '@/components/BTLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { formatDistance, formatDuration, formatDate, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { useRideHistory, useActiveRide, setSoloRoute, PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';
import { useTrips, legCount, tripFinished, chooseTrip, forgetTrip } from '@/features/ride/lib/trips';
import { openBlacktopMap } from '@/features/map/hooks/useMapOverlay';
import { PageTips } from '@/features/guide';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('receipt-row font-receipt', strong && '!text-[1.6rem]')}>
      <span className="uppercase tracking-wider shrink-0">{label}</span>
      <span className="leader" aria-hidden />
      <span className="uppercase font-bold text-right">{value}</span>
    </div>
  );
}

const Rule = ({ double }: { double?: boolean }) =>
  double ? <div className="my-3 h-[5px] border-y-2 border-[--ink] opacity-70" /> : <div className="my-3 border-t-2 border-dashed border-[--ink] opacity-60" />;

/** A short date in the app's language: "Sat 12 Oct". */
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(document.documentElement.lang || undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const shortTime = (iso: string) => new Date(iso).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * The route as printed on the receipt: every point of the trip as a node on
 * one line, the legs ridden solid and the ones still to ride dotted, the next
 * stop ringed.
 */
function StopStrip({ points, legsDone }: { points: { name: string }[]; legsDone: number }) {
  return (
    <div className="mt-4" aria-hidden>
      <div className="flex items-center">
        {points.map((_, i) => (
          <div key={i} className={cn('flex items-center', i > 0 && 'flex-1')}>
            {i > 0 && <div className={cn('flex-1 h-0 border-t-[3px] mx-0.5', i <= legsDone ? 'border-solid border-[--ink]' : 'border-dotted border-[--ink-soft]')} />}
            <div
              className={cn(
                'w-3.5 h-3.5 rounded-full border-[3px] border-[--ink] shrink-0',
                i <= legsDone ? 'bg-[--ink]' : 'bg-[--paper]',
                i === legsDone + 1 && 'ring-2 ring-offset-2 ring-offset-[--paper] ring-[--ink]',
              )}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[0.95rem] leading-none uppercase gap-1">
        <span className="truncate max-w-[38%] text-left">{points[0]?.name}</span>
        {points.length > 2 && <span className="opacity-70 shrink-0">{points.length === 3 ? tr("1 stop") : tr("{0} stops", [points.length - 2])}</span>}
        <span className="truncate max-w-[38%] text-right">{points[points.length - 1]?.name}</span>
      </div>
    </div>
  );
}

/**
 * A trip (ride/lib/trips): its combined receipt on mint stock (every leg's
 * rides added up, legs done, the dates), then each leg from one point to the
 * next with the rides that rode it (each opens its own leg receipt), and
 * Continue trip while there are legs left: the route from the next unfinished
 * point, a ride started, the map guiding.
 */
export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trips = useTrips();
  const trip = trips.find((t) => t.id === id) ?? null;
  const { rides } = useRideHistory();
  const { settings } = useSettings();
  const { terms, canLean } = useExperience();
  const { startRide, rideState } = useActiveRide();
  const peaksHidden = usePeaksHidden();

  if (!trip) {
    return (
      <div className="min-h-dvh p-4 safe-top safe-bottom">
        <PageHeader title={tr("Trip")} backTo="/history" />
        <p className="text-sm text-muted-foreground text-center mt-10">{tr("This trip is no longer here.")}</p>
      </div>
    );
  }

  const mine = rides.filter((r) => r.trip?.tripId === trip.id).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const distance = mine.reduce((n, r) => n + (r.distance || 0), 0);
  const duration = mine.reduce((n, r) => n + (r.duration || 0), 0);
  const top = mine.reduce((n, r) => Math.max(n, r.maxSpeed || 0), 0);
  const lean = mine.reduce((n, r) => Math.max(n, r.maxLeanLeft || 0, r.maxLeanRight || 0), 0);
  const total = legCount(trip);
  const done = tripFinished(trip);
  const first = mine[0];
  const last = mine[mine.length - 1];
  const showLean = canLean && settings.leanAngleEnabled;
  const days = new Set(mine.map((r) => new Date(r.startedAt).toDateString())).size;

  // Each stage as it was ridden: the rides that set off on a leg, and the legs they took in
  // (one ride can ride several legs, or end short and leave the rest to the next).
  const stages = trip.points.slice(1).flatMap((_, i) => {
    const on = mine.filter((r) => r.trip!.from === i);
    if (!on.length) return [];
    const to = Math.max(i + 1, ...on.map((r) => r.trip!.to));
    const d = on.reduce((n, r) => n + (r.distance || 0), 0);
    const t = on.reduce((n, r) => n + (r.duration || 0), 0);
    return [
      {
        from: i,
        to,
        rides: on,
        start: on[0].startedAt,
        distance: d,
        duration: t,
        top: on.reduce((n, r) => Math.max(n, r.maxSpeed || 0), 0),
        avg: t > 0 ? d / (t / 3600) : 0,
        lean: on.reduce((n, r) => Math.max(n, r.maxLeanLeft || 0, r.maxLeanRight || 0), 0),
      },
    ];
  });
  type Stage = (typeof stages)[number];
  const legName = (st: Stage) => (st.to - st.from > 1 ? tr("Legs {0}–{1}", [st.from + 1, st.to]) : tr("Leg {0}", [st.from + 1]));
  const most = (k: 'distance' | 'top' | 'avg') => (stages.length > 1 ? stages.reduce((a, b) => (b[k] > a[k] ? b : a)) : null);
  const longest = most('distance');
  const fastest = most('top');
  const quickest = most('avg');
  const dist = (mi: number) => `${formatDistance(mi, settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`;
  const speed = (mph: number) => `${formatSpeed(mph, settings.speedUnit)} ${getSpeedLabel(settings.speedUnit)}`;
  const peak = (mph: number) => (peaksHidden ? PEAK_HIDDEN : speed(mph));
  const leanText = (deg: number) => (peaksHidden ? PEAK_HIDDEN : `${Math.round(deg)}°`);

  const carryOn = () => {
    haptics.tick();
    if (rideState.isActive) return navigate('/ride');
    const plan = chooseTrip(trip.id);
    if (!plan) return;
    setSoloRoute({ destination: plan.destination, stops: plan.stops });
    if (!startRide(false)) return;
    navigate('/ride');
    queueMicrotask(() => openBlacktopMap({ lat: plan.destination.lat, lng: plan.destination.lng, name: plan.destination.name }));
  };

  return (
    <div className="min-h-dvh p-4 safe-top safe-bottom md:p-5 space-y-4">
      <PageTips
        page="trip"
        scroll
        tips={[
          { target: '[data-tip="trip-receipt"]', text: tr("The whole trip on one receipt: every leg with its date, distance, time and speeds, and the best of it.") },
          { target: '[data-tip="trip-continue"]', text: tr("Carry on from the next leg: the route is set and the ride starts.") },
          { target: '[data-tip="trip-legs"]', text: tr("Tap a ride under a leg for that ride's own receipt.") },
        ]}
      />
      <PageHeader title={trip.name} subtitle={done ? tr("Finished") : tr("Leg {0} of {1}", [trip.legsDone + 1, total])} backTo="/history" />

      {/* In landscape the receipt and the legs sit side by side. */}
      <div className="space-y-4 short:space-y-0 short:grid short:grid-cols-[minmax(0,360px)_minmax(0,1fr)] short:gap-4 short:items-start">
      {/* The trip's own receipt: the route, every leg itemised, the best of it, the totals. */}
      <div className="w-full max-w-[360px] mx-auto short:mx-0">
        <div className="receipt-edge-top receipt-edge-trip" />
        <div data-tip="trip-receipt" className="receipt receipt-trip relative px-5 py-5 font-receipt text-[--ink] overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <BTLogo size="sm" className="!bg-[--ink] !text-[--paper] !border-[--ink]" />
            <div className="text-right text-base leading-tight uppercase">
              {first && <div>{shortDay(first.startedAt)}</div>}
              {last && last !== first && <div className="opacity-70">{tr("to {0}", [shortDay(last.startedAt)])}</div>}
            </div>
          </div>
          <div className="text-center mb-1">
            <div className="text-3xl font-bold tracking-[0.15em]">{tr("BLACKTOP STORE")}</div>
            <div className="text-sm tracking-[0.3em] opacity-70 mt-1">{tr("— TRIP RECEIPT —")}</div>
            <div className="mt-3 text-[1.9rem] font-bold uppercase leading-none break-words">{trip.name}</div>
          </div>

          <StopStrip points={trip.points} legsDone={trip.legsDone} />

          <Rule double />
          {/* Itemised: a line for each stage, like the items on a till receipt. */}
          <div className="space-y-3">
            {stages.map((st) => (
              <div key={st.from} className="leading-tight">
                <div className="flex items-baseline gap-2 text-[1.3rem]">
                  <span className="font-bold uppercase shrink-0">{legName(st)}</span>
                  <span className="flex-1 border-b-2 border-dotted border-[--ink] opacity-60 -translate-y-1" aria-hidden />
                  <span className="font-bold shrink-0 uppercase">{dist(st.distance)}</span>
                </div>
                <div className="uppercase text-[1.1rem] truncate">
                  {trip.points[st.from]?.name || tr("Start")} → {trip.points[st.to]?.name || tr("destination")}
                </div>
                <div className="flex flex-wrap gap-x-3 text-[1rem] text-[--ink-soft] uppercase">
                  <span>{shortDay(st.start)} {shortTime(st.start)}</span>
                  <span>{formatDuration(st.duration)}</span>
                  {settings.speedFocusEnabled && <span>{tr("Top {0}", [peak(st.top)])}</span>}
                  {settings.speedFocusEnabled && st.avg > 0 && <span>{tr("Avg {0}", [speed(st.avg)])}</span>}
                  {showLean && <span>{tr("Lean {0}", [leanText(st.lean)])}</span>}
                  {st.rides.length > 1 && <span>{tr("{0} rides", [st.rides.length])}</span>}
                </div>
              </div>
            ))}
            {trip.points.slice(1).map((to, i) =>
              i >= trip.legsDone && !stages.some((st) => st.from <= i && i < st.to) ? (
                <div key={`todo-${i}`} className="flex items-baseline gap-2 text-[1.1rem] text-[--ink-soft] uppercase">
                  <span className="shrink-0">{tr("Leg {0}", [i + 1])}</span>
                  <span className="truncate">
                    {trip.points[i]?.name} → {to.name}
                  </span>
                  <span className="ml-auto shrink-0">{tr("To ride")}</span>
                </div>
              ) : null,
            )}
          </div>

          {stages.length > 1 && (
            <>
              <Rule />
              {/* The best of the trip. */}
              <div className="text-center text-sm tracking-[0.3em] opacity-70 mb-2">{tr("— HIGHLIGHTS —")}</div>
              <div className="space-y-2">
                {longest && <Row label={tr("Longest leg")} value={`${legName(longest)} · ${dist(longest.distance)}`} />}
                {settings.speedFocusEnabled && fastest && !peaksHidden && <Row label={tr("Fastest leg")} value={`${legName(fastest)} · ${speed(fastest.top)}`} />}
                {settings.speedFocusEnabled && quickest && <Row label={tr("Quickest average")} value={`${legName(quickest)} · ${speed(quickest.avg)}`} />}
              </div>
            </>
          )}

          <Rule />
          <div className="space-y-2">
            <Row label={tr("Legs")} value={tr("{0} of {1}", [done ? total : trip.legsDone, total])} />
            <Row label={tr("Days")} value={String(days)} />
            <Row label={tr("Time")} value={formatDuration(duration)} />
            {settings.speedFocusEnabled && duration > 0 && <Row label={tr("Avg Speed")} value={speed(distance / (duration / 3600))} />}
            {settings.speedFocusEnabled && <Row label={tr("Top Speed")} value={peak(top)} />}
            {showLean && <Row label={tr("Max Lean")} value={leanText(lean)} />}
          </div>
          <Rule double />
          <Row strong label={tr("Total")} value={dist(distance)} />

          {/* A finished trip gets the stamp inked across the bottom. */}
          <div className="relative mt-5 min-h-16 flex items-center justify-center">
            {done ? (
              <div className="trip-stamp px-4 py-1.5 border-[3px] border-[--ink] rounded-md text-[1.6rem] font-bold tracking-[0.2em] leading-none text-center">
                {tr("TRIP COMPLETE")}
                {(trip.finishedAt || last) && <div className="text-[0.95rem] tracking-[0.15em] mt-1 opacity-80 uppercase">{shortDay(trip.finishedAt ?? last!.endedAt ?? last!.startedAt)}</div>}
              </div>
            ) : (
              <div className="text-base tracking-[0.2em]">{tr("TO BE CONTINUED")}</div>
            )}
          </div>
          <div className="receipt-barcode mt-3" aria-hidden />
          <div className="text-center text-sm tracking-[0.25em] opacity-70 mt-1 uppercase">{trip.id.slice(-8)}</div>
        </div>
        <div className="receipt-edge-bottom receipt-edge-trip" />
      </div>

      <div className="space-y-4 min-w-0 short:sticky short:top-2">
      {!done && (
        <Button data-tip="trip-continue" onClick={carryOn} className="w-full h-12 rounded-2xl font-semibold">
          <Play className="w-4 h-4 mr-2" />
          {tr("Continue trip")}
        </Button>
      )}

      {/* Each leg, with the rides that rode it (their own receipts). */}
      <section data-tip="trip-legs" className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Legs")}</h2>
        {trip.points.slice(1).map((to, i) => {
          const from = trip.points[i];
          const legDone = i < trip.legsDone;
          const isNext = i === trip.legsDone;
          const legRides = mine.filter((r) => r.trip && (r.trip.from <= i && i < r.trip.to || (r.trip.to <= r.trip.from && r.trip.from === i)));
          return (
            <div key={i} className={cn('rounded-2xl frost border p-3', legDone ? 'border-[hsl(150_55%_50%)]/40' : isNext ? 'border-accent/50' : 'border-border/50')}>
              <div className="flex items-center gap-2">
                {legDone ? <Check className="w-4 h-4 text-[hsl(150_55%_58%)] shrink-0" /> : <Circle className={cn('w-4 h-4 shrink-0', isNext ? 'text-accent' : 'text-muted-foreground')} />}
                <span className="text-xs font-semibold text-muted-foreground shrink-0">{tr("Leg {0}", [i + 1])}</span>
                <span className="text-sm font-medium truncate">
                  {(from.name || tr("Start"))} → {to.name || tr("destination")}
                </span>
                {isNext && !done && <span className="ml-auto text-[10px] font-semibold text-accent shrink-0">{tr("Next")}</span>}
              </div>
              {legRides.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {legRides.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/ride/${r.id}`)}
                        className="w-full flex items-center gap-2 rounded-xl bg-background/40 px-2.5 py-2 text-left text-xs hover:bg-secondary/50"
                      >
                        <span className="flex-1 min-w-0 truncate">
                          {r.name || formatDate(r.startedAt)}
                          <span className="block text-[10px] text-muted-foreground">{shortDay(r.startedAt)} · {shortTime(r.startedAt)}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {formatDistance(r.distance, settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <button
        type="button"
        onClick={() => {
          forgetTrip(trip.id);
          toast(tr("Trip forgotten"), { description: tr("Its {0} stay in History.", [terms.rides]) });
          navigate('/history');
        }}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-3"
      >
        <Trash2 className="w-3.5 h-3.5" /> {tr("Forget trip")}
      </button>
      </div>
      </div>
    </div>
  );
}
