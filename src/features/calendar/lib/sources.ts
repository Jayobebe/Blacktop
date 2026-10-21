/**
 * Everything on the Blacktop Calendar, by day: what the rider has done (rides
 * coloured like their receipts, trips, badges, bests, Track Day dog tags, a
 * ride from this day in an earlier year), their vehicle (services due, dated
 * from their own recent riding when it's by distance, and done; logbook notes),
 * what they've put on it (plans, reminders, Track Day bookings, and a safety
 * check the evening before a long one), their crews (plans with who's going,
 * the week's challenges and results, the month's goal), safety (drills, rescue
 * calls, a drill when one is due), and in demo mode a workshop booking from the
 * demo workspace. All from the phone except crew plans (crewEvents.ts).
 */
import { useMemo } from 'react';
import {
  Bike, Car, Route as RouteIcon, Award, Trophy, History, Wrench, Check, BookOpen, Bell, MapPin, Flag, Users, Target,
  ShieldCheck, LifeBuoy, Timer, Building2, type LucideIcon,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import { milesText, kmText } from '@/lib/units';
import { useDemoMode } from '@/lib/demoMode';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { useRideHistory, usePeaksHidden } from '@/features/ride';
import { useTrips, legCount } from '@/features/ride/lib/trips';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { useGarage, useBikeStats, serviceStatus } from '@/features/garage';
import { getInheritedLog } from '@/features/logbook/lib/logbookStore';
import { useSpectreCards } from '@/features/cards/hooks/useSpectreCards';
import { challengesForWeek, specialForWeek, monthlyGoalFor, weekKey } from '@/features/crew/challenges';
import { useCalendarStore, dayKey, addDays, dayStart, reminderDayFrom, reminderName, type CalendarItem, type ReminderItem } from './calendarStore';
import type { CrewEvent } from './crewEvents';

export type CalFilter = 'rides' | 'plans' | 'vehicle' | 'crew' | 'safety';
export const CAL_FILTERS: CalFilter[] = ['rides', 'plans', 'vehicle', 'crew', 'safety'];

export type CalKind =
  | 'ride' | 'trip' | 'badge' | 'best' | 'memory' | 'spectre'
  | 'service' | 'serviced' | 'logbook'
  | 'plan' | 'reminder' | 'track'
  | 'crewEvent' | 'challenge' | 'crewGoal'
  | 'safety' | 'drill' | 'rescue'
  | 'business';

export interface CalEvent {
  id: string;
  day: string;
  /** When it happens (ms), for the time and the order within the day. */
  at?: number;
  kind: CalKind;
  filter: CalFilter;
  title: string;
  sub?: string;
  /** A CSS colour (the receipts' and the app's own). */
  color: string;
  icon: LucideIcon;
  /** A ride, trip or route id; a calendar item; a crew plan; a service item. */
  rideId?: string;
  tripId?: string;
  item?: CalendarItem;
  crewEvent?: CrewEvent;
  service?: { bikeId: string; itemId: string };
  /** A date worked out (a service due by distance), not a fixed one. */
  estimate?: boolean;
}

export const COLORS = {
  solo: 'hsl(0 0% 72%)',
  convoy: 'hsl(212 80% 66%)',
  trip: 'hsl(150 55% 50%)',
  track: 'hsl(330 80% 65%)',
  plan: 'hsl(var(--accent))',
  reminder: 'hsl(38 92% 55%)',
  overdue: 'hsl(var(--destructive))',
  done: 'hsl(0 0% 58%)',
  crew: 'hsl(var(--lava, var(--accent)))',
  safety: 'hsl(var(--burn))',
  gold: 'hsl(48 95% 60%)',
  business: 'hsl(265 70% 72%)',
};

/** The colours each filter covers, its own first: the filter pills wear them so they match the dots. */
export const FILTER_COLORS: Record<CalFilter, string[]> = {
  rides: [COLORS.convoy, COLORS.solo, COLORS.trip, COLORS.track, COLORS.gold],
  plans: [COLORS.plan, COLORS.track, COLORS.business],
  vehicle: [COLORS.reminder, COLORS.done],
  crew: [COLORS.crew],
  safety: [COLORS.safety],
};

const BADGE_NAMES: Record<string, string> = {
  'night-owl': 'Night Owl',
  'hard-ass': 'Hard Ass',
  'always-out': 'Always Out',
  'speed-demon': 'Speed Demon',
  journeyman: 'Journeyman',
  'lean-fiend': 'Lean Fiend',
  'g-lock': 'G-Lock',
  'corner-carver': 'Corner Carver',
  fallback: 'Fallback',
};

export interface CalendarData {
  byDay: Map<string, CalEvent[]>;
  /** Distance ridden a day, miles (the heat map). */
  heat: Map<string, number>;
  /** Mondays (day keys) of weeks with a ride: the streak's road line. */
  rideWeeks: Set<string>;
}

const mondayKey = (key: string) => {
  const d = dayStart(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
};

/** Everything between `from` and `to` (day keys, inclusive), with crew plans passed in. */
export function useCalendarData(from: string, to: string, crewEvents: CrewEvent[]): CalendarData {
  const { rides } = useRideHistory();
  const trips = useTrips();
  const routes = useSavedRoutes();
  const { settings } = useSettings();
  const { terms } = useExperience();
  const peaksHidden = usePeaksHidden();
  const { activeBike } = useGarage();
  const bikeStats = useBikeStats(activeBike);
  const { spectres } = useSpectreCards();
  const { items, log } = useCalendarStore();
  const { enabled: demo } = useDemoMode();

  return useMemo(() => {
    const byDay = new Map<string, CalEvent[]>();
    const heat = new Map<string, number>();
    const rideWeeks = new Set<string>();
    const inRange = (k: string) => k >= from && k <= to;
    const push = (e: CalEvent) => {
      if (!inRange(e.day)) return;
      const list = byDay.get(e.day);
      if (list) list.push(e);
      else byDay.set(e.day, [e]);
    };
    const today = dayKey(Date.now());
    const RideIcon = terms.car ? Car : Bike;

    // ── Rides ──
    const done = rides.filter((r) => r.endedAt);
    const perDay = new Map<string, number>();
    for (const r of done) {
      const k = dayKey(Date.parse(r.startedAt));
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
      heat.set(k, (heat.get(k) ?? 0) + (r.distance || 0));
      rideWeeks.add(mondayKey(k));
      const color = r.track ? COLORS.track : r.trip ? COLORS.trip : r.isConvoyRide ? COLORS.convoy : COLORS.solo;
      push({
        id: `ride:${r.id}`,
        day: k,
        at: Date.parse(r.startedAt),
        kind: 'ride',
        filter: 'rides',
        title: r.name || (r.track ? tr("Track Day: {0}", [r.track.trackName]) : terms.car ? tr("Drive") : tr("Ride")),
        sub: [milesText(r.distance || 0), r.trip ? tr("Leg of {0}", [r.trip.name]) : r.isConvoyRide ? tr("Convoy") : null].filter(Boolean).join(' · '),
        color,
        icon: RideIcon,
        rideId: r.id,
      });
      // Badges earned on it (with collecting on): convoy badges as kept, the solo ones by their rules.
      if (settings.collectiblesEnabled) {
        const names = new Set((r.earnedBadges ?? []).map((b) => BADGE_NAMES[b] ?? b));
        const h = new Date(r.startedAt).getHours();
        if (h >= 20 || h < 5) names.add('Night Owl');
        if ((r.distance || 0) >= 150) names.add('Hard Ass');
        if (names.size) {
          push({ id: `badge:${r.id}`, day: k, at: Date.parse(r.startedAt) + 1, kind: 'badge', filter: 'rides', title: [...names].join(', '), sub: tr("Badges earned"), color: COLORS.gold, icon: Award, rideId: r.id });
        }
      }
      // A ride from this day in an earlier year.
      const [y, md] = [Number(k.slice(0, 4)), k.slice(5)];
      for (let yy = y + 1; yy <= Number(today.slice(0, 4)) + 1; yy++) {
        const years = yy - y;
        push({
          id: `memory:${r.id}:${yy}`,
          day: `${yy}-${md}`,
          kind: 'memory',
          filter: 'rides',
          title: years === 1 ? tr("A year ago: {0}", [r.name || milesText(r.distance || 0)]) : tr("{0} years ago: {1}", [years, r.name || milesText(r.distance || 0)]),
          sub: milesText(r.distance || 0),
          color: COLORS.gold,
          icon: History,
          rideId: r.id,
        });
      }
    }
    // Always Out: three in a day.
    if (settings.collectiblesEnabled) {
      for (const [k, n] of perDay) {
        if (n >= 3) push({ id: `badge-out:${k}`, day: k, kind: 'badge', filter: 'rides', title: 'Always Out', sub: tr("Badges earned"), color: COLORS.gold, icon: Award });
      }
    }
    // Personal bests, each on its day.
    if (done.length) {
      const longest = done.reduce((a, b) => ((b.distance || 0) > (a.distance || 0) ? b : a));
      push({ id: `best-long:${longest.id}`, day: dayKey(Date.parse(longest.startedAt)), kind: 'best', filter: 'rides', title: tr("Your longest: {0}", [milesText(longest.distance || 0)]), color: COLORS.gold, icon: Trophy, rideId: longest.id });
      if (settings.speedFocusEnabled) {
        const fastest = done.reduce((a, b) => ((b.maxSpeed || 0) > (a.maxSpeed || 0) ? b : a));
        // With peaks private, the day is still marked, never the figure.
        push({ id: `best-fast:${fastest.id}`, day: dayKey(Date.parse(fastest.startedAt)), kind: 'best', filter: 'rides', title: peaksHidden ? tr("Your top speed day") : tr("Your top speed day: {0}", [`${Math.round(settings.speedUnit === 'kph' ? (fastest.maxSpeed || 0) * 1.609344 : fastest.maxSpeed || 0)} ${settings.speedUnit === 'kph' ? 'km/h' : 'mph'}`]), color: COLORS.gold, icon: Trophy, rideId: fastest.id });
      }
      const laps = done.filter((r) => r.track?.bestLapMs);
      if (laps.length) {
        const best = laps.reduce((a, b) => ((b.track!.bestLapMs ?? Infinity) < (a.track!.bestLapMs ?? Infinity) ? b : a));
        const ms = best.track!.bestLapMs!;
        const lap = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
        push({ id: `best-lap:${best.id}`, day: dayKey(Date.parse(best.startedAt)), kind: 'best', filter: 'rides', title: tr("Your best lap: {0}", [lap]), sub: best.track!.trackName, color: COLORS.track, icon: Timer, rideId: best.id });
      }
    }
    // Track Day dog tags taken (Spectres).
    if (settings.collectiblesEnabled) {
      for (const s of spectres) {
        if (!s.earnedAt) continue;
        push({ id: `spectre:${s.key}`, day: dayKey(s.earnedAt), at: s.earnedAt, kind: 'spectre', filter: 'rides', title: tr("Took {0}'s time", [s.setterName]), sub: s.track, color: COLORS.track, icon: Award });
      }
    }

    // ── Trips: one mark a day across the days they ran ──
    for (const t of trips) {
      const days = t.rides.map((r) => dayKey(Date.parse(r.at))).sort();
      if (!days.length) continue;
      const total = legCount(t);
      for (let k = days[0], n = 1; k <= days[days.length - 1]; k = addDays(k, 1), n++) {
        push({ id: `trip:${t.id}:${k}`, day: k, kind: 'trip', filter: 'rides', title: t.name, sub: tr("Day {0} · {1} of {2} legs", [n, t.legsDone, total]), color: COLORS.trip, icon: RouteIcon, tripId: t.id });
      }
    }

    // ── The vehicle ──
    if (settings.garageEnabled && activeBike) {
      // How far it's ridden a day lately, for services due by distance.
      const since = Date.now() - 60 * 86_400_000;
      const recentKm = done.filter((r) => (r as { bikeId?: string }).bikeId === activeBike.id && Date.parse(r.startedAt) >= since).reduce((n, r) => n + (r.distance || 0) * 1.609344, 0);
      const kmPerDay = recentKm / 60;
      for (const item of activeBike.maintenance) {
        const st = serviceStatus(item, bikeStats.odometerKm);
        let due: string | null = null;
        let estimate = false;
        if (st.tone === 'over') due = today;
        else if (st.dueInDays != null && (st.reason === 'time' || kmPerDay < 0.3)) due = addDays(today, st.dueInDays);
        else if (kmPerDay >= 0.3) {
          due = addDays(today, Math.max(0, Math.ceil(st.dueInKm / kmPerDay)));
          estimate = true;
          if (st.dueInDays != null && st.dueInDays < Math.ceil(st.dueInKm / kmPerDay)) {
            due = addDays(today, st.dueInDays);
            estimate = false;
          }
        }
        if (due) {
          push({
            id: `service:${item.id}`,
            day: due,
            kind: 'service',
            filter: 'vehicle',
            title: st.tone === 'over' ? tr("{0} overdue", [item.name]) : tr("{0} due", [item.name]),
            sub: estimate ? tr("Around then, at your pace ({0} to go)", [kmText(st.dueInKm)]) : activeBike.name,
            color: st.tone === 'over' ? COLORS.overdue : COLORS.reminder,
            icon: Wrench,
            service: { bikeId: activeBike.id, itemId: item.id },
            estimate,
          });
        }
        if (item.lastServiceAt) push({ id: `serviced:${item.id}`, day: dayKey(item.lastServiceAt), at: item.lastServiceAt, kind: 'serviced', filter: 'vehicle', title: tr("{0} done", [item.name]), sub: activeBike.name, color: COLORS.done, icon: Check });
      }
      const book = getInheritedLog(activeBike.id);
      for (const n of book?.notes ?? []) {
        push({ id: `note:${n.id}`, day: dayKey(n.at), at: n.at, kind: 'logbook', filter: 'vehicle', title: n.text.length > 60 ? `${n.text.slice(0, 59)}…` : n.text, sub: tr("Logbook · {0}", [n.author]), color: COLORS.done, icon: BookOpen });
      }
      for (const o of book?.owners ?? []) {
        if (o.from) push({ id: `owner:${o.name}:${o.from}`, day: dayKey(o.from), at: o.from, kind: 'logbook', filter: 'vehicle', title: tr("{0} took on {1}", [o.name, activeBike.name]), sub: tr("Logbook"), color: COLORS.done, icon: BookOpen });
      }
    }

    // ── The rider's own ──
    for (const i of items) {
      if (i.kind === 'reminder') {
        // A yearly one on its date each year in view.
        const firstYear = Number(from.slice(0, 4));
        const lastYear = Number(to.slice(0, 4));
        const days = i.yearly ? Array.from({ length: lastYear - firstYear + 1 }, (_, n) => `${firstYear + n}${i.day.slice(4)}`).filter((d) => d >= i.day) : [i.day];
        for (const d of days) push(reminderEvent(i, d));
        continue;
      }
      if (i.kind === 'plan') {
        const route = i.routeId ? routes.find((r) => r.id === i.routeId) : null;
        const trip = i.tripId ? trips.find((t) => t.id === i.tripId) : null;
        push({
          id: `plan:${i.id}`,
          day: i.day,
          at: timeOf(i.day, i.time),
          kind: 'plan',
          filter: 'plans',
          title: i.title,
          sub: [i.time, trip ? tr("Leg {0} of {1}", [(i.leg ?? trip.legsDone) + 1, legCount(trip)]) : null, route?.name ?? i.place?.name].filter(Boolean).join(' · '),
          color: COLORS.plan,
          icon: Flag,
          item: i,
        });
        // A long one (a route with stops, a trip's leg): a safety check the evening before.
        if ((route?.via?.length ?? 0) > 0 || trip) push(safetyCheck(i));
        continue;
      }
      push({ id: `track:${i.id}`, day: i.day, at: timeOf(i.day, i.time), kind: 'track', filter: 'plans', title: tr("Track Day: {0}", [i.circuit]), sub: tr("{0} of {1} packed", [i.packing.filter((p) => p.done).length, i.packing.length]), color: COLORS.track, icon: Timer, item: i });
      push(safetyCheck(i));
    }

    // ── Crews ──
    for (const e of crewEvents) {
      const at = Date.parse(e.starts_at);
      push({
        id: `crew:${e.id}`,
        day: dayKey(at),
        at,
        kind: 'crewEvent',
        filter: 'crew',
        title: e.title,
        sub: [e.place_name, e.going === 1 ? tr("1 going") : tr("{0} going", [e.going])].filter(Boolean).join(' · '),
        color: COLORS.crew,
        icon: e.kind === 'meet' ? MapPin : Users,
        crewEvent: e,
      });
    }
    if (settings.blacktopWorldEnabled) {
      for (let k = mondayKey(from); k <= to; k = addDays(k, 7)) {
        const [a, b] = challengesForWeek(weekKey(dayStart(k)));
        const special = specialForWeek(weekKey(dayStart(k)));
        push({ id: `challenge:${k}`, day: k, kind: 'challenge', filter: 'crew', title: tr("Crew challenges: {0} and {1}", [a.title, b.title]), sub: special ? special.name : tr("All week"), color: COLORS.crew, icon: Target });
        if (k <= today) push({ id: `results:${k}`, day: k, kind: 'challenge', filter: 'crew', title: tr("Last week's crew results"), color: COLORS.crew, icon: Trophy });
      }
      // The month's crew goal: from the 1st to its last day.
      for (let d = dayStart(from); dayKey(d) <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const goal = monthlyGoalFor(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`);
        push({ id: `goal:${dayKey(first)}`, day: dayKey(first), kind: 'crewGoal', filter: 'crew', title: tr("Crew goal: {0}", [goal.title]), color: COLORS.crew, icon: Users });
        push({ id: `goalend:${dayKey(last)}`, day: dayKey(last), kind: 'crewGoal', filter: 'crew', title: tr("Crew goal ends: {0}", [goal.title]), color: COLORS.crew, icon: Users });
      }
    }

    // ── Safety ──
    for (const a of log) {
      const k = dayKey(a.at);
      if (a.kind === 'drill') push({ id: `drill:${a.at}`, day: k, at: a.at, kind: 'drill', filter: 'safety', title: tr("Rescue drill done"), color: COLORS.safety, icon: ShieldCheck });
      else push({ id: `rescue:${a.at}`, day: k, at: a.at, kind: 'rescue', filter: 'safety', title: a.kind === 'rescue_sent' ? tr("Rescue call sent") : tr("You answered {0}'s rescue call", [a.note || tr("a rider")]), color: COLORS.safety, icon: LifeBuoy });
    }
    if (settings.autoRescueEnabled) {
      const lastDrill = log.find((a) => a.kind === 'drill')?.at ?? null;
      const due = lastDrill ? addDays(dayKey(lastDrill), 90) : today;
      push({ id: `drill-due:${due}`, day: due < today ? today : due, kind: 'safety', filter: 'safety', title: tr("Time for a rescue drill"), sub: lastDrill ? tr("Three months since the last one") : tr("Check rescue works before you need it"), color: COLORS.safety, icon: ShieldCheck });
    }

    // ── Businesses (Blacktop Enterprise): the demo workspace's booking ──
    if (demo) {
      push({ id: 'demo-booking', day: addDays(today, 6), at: timeOf(addDays(today, 6), '10:00'), kind: 'business', filter: 'plans', title: tr("Service booked: {0}", ["Mecha-Nick's Garage"]), sub: '10:00', color: COLORS.business, icon: Building2 });
    }

    for (const list of byDay.values()) list.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    return { byDay, heat, rideWeeks };
  }, [from, to, rides, trips, routes, settings, terms.car, peaksHidden, activeBike, bikeStats.odometerKm, spectres, items, log, crewEvents, demo]);
}

function timeOf(day: string, time?: string): number {
  const d = dayStart(day);
  const [h, m] = (time ?? '09:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function reminderEvent(r: ReminderItem, day: string): CalEvent {
  return {
    id: `reminder:${r.id}:${day}`,
    day,
    at: timeOf(day, r.time),
    kind: 'reminder',
    filter: 'plans',
    title: r.type === 'other' ? r.title : reminderName(r),
    sub: [r.yearly ? tr("Every year") : null, r.notes].filter(Boolean).join(' · ') || undefined,
    color: COLORS.reminder,
    icon: Bell,
    item: r,
  };
}

function safetyCheck(i: CalendarItem): CalEvent {
  const day = addDays(i.day, -1);
  return {
    id: `check:${i.id}`,
    day,
    at: timeOf(day, '19:00'),
    kind: 'safety',
    filter: 'safety',
    title: tr("Safety check for tomorrow"),
    sub: tr("Crash check, your emergency contact and the safe-arrival text"),
    color: COLORS.safety,
    icon: ShieldCheck,
    item: i,
  };
}

export { reminderDayFrom, reminderName };
