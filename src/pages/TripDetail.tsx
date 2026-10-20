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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-row font-receipt">
      <span className="uppercase tracking-wider">{label}</span>
      <span className="leader" aria-hidden />
      <span className="uppercase font-bold">{value}</span>
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
  const { terms } = useExperience();
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
  const total = legCount(trip);
  const done = tripFinished(trip);
  const first = mine[0];
  const last = mine[mine.length - 1];

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
      <PageHeader title={trip.name} subtitle={done ? tr("Finished") : tr("Leg {0} of {1}", [trip.legsDone + 1, total])} backTo="/history" />

      {/* The trip's own receipt: everything ridden on it so far. */}
      <div className="w-full max-w-[360px] mx-auto">
        <div className="receipt-edge-top receipt-edge-trip" />
        <div className="receipt receipt-trip relative px-6 py-5 font-receipt text-[--ink]">
          <div className="flex items-center justify-between mb-3">
            <BTLogo size="sm" className="!bg-[--ink] !text-[--paper] !border-[--ink]" />
            <div className="text-right text-base leading-tight">
              {first && <div>{formatDate(first.startedAt)}</div>}
              {last && last !== first && <div className="opacity-70">{formatDate(last.startedAt)}</div>}
            </div>
          </div>
          <div className="text-center mb-1">
            <div className="text-3xl font-bold tracking-[0.15em]">{tr("BLACKTOP STORE")}</div>
            <div className="text-sm tracking-[0.3em] opacity-70 mt-1">{tr("— TRIP RECEIPT —")}</div>
          </div>
          <div className="mt-4 space-y-2">
            <Row label={tr("Trip")} value={trip.name} />
            <Row label={tr("Legs")} value={done ? tr("{0} of {1}", [total, total]) : tr("{0} of {1}", [trip.legsDone, total])} />
            <Row label={tr("Rides")} value={String(mine.length)} />
          </div>
          <div className="my-3 border-t-2 border-dashed border-[--ink] opacity-60" />
          <div className="space-y-2">
            <Row label={tr("Distance")} value={`${formatDistance(distance, settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`} />
            <Row label={tr("Time")} value={formatDuration(duration)} />
            {settings.speedFocusEnabled && duration > 0 && (
              <Row label={tr("Avg Speed")} value={`${formatSpeed(distance / (duration / 3600), settings.speedUnit)} ${getSpeedLabel(settings.speedUnit)}`} />
            )}
            {settings.speedFocusEnabled && (
              <Row label={tr("Top Speed")} value={peaksHidden ? PEAK_HIDDEN : `${formatSpeed(top, settings.speedUnit)} ${getSpeedLabel(settings.speedUnit)}`} />
            )}
          </div>
          <div className="my-3 border-t-2 border-dashed border-[--ink] opacity-60" />
          <div className="text-center text-base tracking-[0.2em]">{done ? tr("TRIP COMPLETE") : tr("TO BE CONTINUED")}</div>
          <div className="receipt-barcode mt-3" aria-hidden />
        </div>
        <div className="receipt-edge-bottom receipt-edge-trip" />
      </div>

      {!done && (
        <Button onClick={carryOn} className="w-full h-12 rounded-2xl font-semibold">
          <Play className="w-4 h-4 mr-2" />
          {tr("Continue trip")}
        </Button>
      )}

      {/* Each leg, with the rides that rode it (their own receipts). */}
      <section className="space-y-2">
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
                        <span className="flex-1 min-w-0 truncate">{r.name || formatDate(r.startedAt)}</span>
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
  );
}
