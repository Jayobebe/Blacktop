import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { isThermal } from '@/lib/thermal';
import { pixelDissolve } from '@/lib/warp';
import { milesText } from '@/lib/units';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { useHoldTap } from '@/hooks/useHoldTap';
import { CalendarClock } from '@/features/calendar/components/CalendarClock';
import { DayPanel, verdictIcon } from '@/features/calendar/components/DayPanel';
import { AddSheet } from '@/features/calendar/components/AddSheet';
import { useCalendarData, CAL_FILTERS, FILTER_COLORS, type CalFilter, type CalEvent } from '@/features/calendar/lib/sources';
import { useCrewEvents } from '@/features/calendar/lib/crewEvents';
import { useDailyForecast, pickOfTheWeek } from '@/features/calendar/lib/dailyForecast';
import { sunTimes } from '@/features/calendar/lib/sun';
import { exportIcs } from '@/features/calendar/lib/ics';
import { dayKey, dayStart, addDays } from '@/features/calendar/lib/calendarStore';
import { useRiderSpot } from '@/features/console/lib/whereRider';
import { SlidingPill } from '@/components/SlidingPill';
import { PageTips } from '@/features/guide';


type View = 'month' | 'week' | 'list';
interface Prefs {
  view: View;
  filters: CalFilter[];
  weather: boolean;
  heat: boolean;
}
const PREFS_KEY = 'blacktop_calendar_view';
function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') as Partial<Prefs> | null;
    return {
      view: v?.view === 'week' || v?.view === 'list' ? v.view : 'month',
      filters: Array.isArray(v?.filters) ? (v!.filters.filter((f) => CAL_FILTERS.includes(f)) as CalFilter[]) : [...CAL_FILTERS],
      weather: v?.weather ?? true,
      heat: !!v?.heat,
    };
  } catch {
    return { view: 'month', filters: [...CAL_FILTERS], weather: true, heat: false };
  }
}

const mondayOf = (key: string) => {
  const d = dayStart(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
};

function filterName(f: CalFilter): string {
  switch (f) {
    case 'rides':
      return tr("Rides");
    case 'plans':
      return tr("Plans");
    case 'vehicle':
      return tr("Vehicle");
    case 'crew':
      return tr("Crew");
    default:
      return tr("Safety");
  }
}

/**
 * The Blacktop Calendar (`/calendar`, from the Console's date square): a big
 * live clock (and stopwatch) above it; month, week or list; filters; the
 * weather on the days the forecast reaches; a heat map of distance ridden;
 * the weeks ridden joined by a road's centre line; and the day picked with
 * everything on it. A swipe moves a month (a week in the week view); holding a
 * day adds to it. Its own page, so Home's cards can't be swiped under it.
 */
export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = dayKey(Date.now());
  const [selected, setSelected] = useState(() => (params.get('day') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('day')!) ? params.get('day')! : today));
  const [cursor, setCursor] = useState(() => selected.slice(0, 7) + '-01'); // the month shown
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* this launch only */
      }
      return next;
    });
  const [adding, setAdding] = useState<string | null>(null);

  // The weeks on screen: the month's six, or the selected day's.
  const gridStart = mondayOf(cursor);
  const gridEnd = addDays(gridStart, 41);
  const weekStart = mondayOf(selected);
  const from = [gridStart, weekStart, addDays(today, -1)].sort()[0];
  const to = [gridEnd, addDays(weekStart, 6), addDays(today, 60)].sort().reverse()[0];

  const spot = useRiderSpot(true);
  const crew = useCrewEvents(dayStart(from), dayStart(addDays(to, 1)), true);
  const data = useCalendarData(from, to, crew.events);
  const forecast = useDailyForecast(spot, true);
  const pick = pickOfTheWeek(forecast, today);

  const shown = (k: string): CalEvent[] => (data.byDay.get(k) ?? []).filter((e) => prefs.filters.includes(e.filter));
  const maxHeat = useMemo(() => Math.max(1, ...[...data.heat.values()]), [data.heat]);

  // The streak: weeks in a row with a ride, up to this one (or last, if this one isn't ridden yet).
  const thisWeek = mondayOf(today);
  const streak = useMemo(() => {
    const weeks = new Set<string>();
    for (let w = data.rideWeeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7); data.rideWeeks.has(w); w = addDays(w, -7)) weeks.add(w);
    return weeks;
  }, [data.rideWeeks, thisWeek]);
  const atRisk = !data.rideWeeks.has(thisWeek) && streak.size > 0;

  // A day picked brings its panel into view (it sits under the grid), once it has drawn with that day.
  const panelRef = useRef<HTMLDivElement>(null);
  const [scrollSeq, setScrollSeq] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!scrollSeq || !el) return;
    const raf = requestAnimationFrame(() => {
      // Already well in view: leave the page where it is.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.55) return;
      const still = isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollSeq]);

  const select = (k: string, reveal = true) => {
    haptics.tick();
    setSelected(k);
    setParams({ day: k }, { replace: true });
    if (reveal) setScrollSeq((n) => n + 1);
  };

  // Swipes: a month (or a week) at a time.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLElement>(null);
  const step = (dir: 1 | -1) => {
    haptics.tick();
    // The month (or week) going breaks up into pixels over the one arriving.
    if (gridRef.current) pixelDissolve(gridRef.current);
    if (prefs.view === 'week') {
      const k = addDays(selected, 7 * dir);
      setSelected(k);
      setCursor(k.slice(0, 7) + '-01');
    } else {
      const d = dayStart(cursor);
      d.setMonth(d.getMonth() + dir);
      setCursor(dayKey(d));
    }
  };
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    },
  };

  const lang = document.documentElement.lang || undefined;
  // Wrapped for a month or a week (pages/Wrapped), from its title or a week's road line.
  const navigate = useNavigate();
  const openWrapped = (period: 'week' | 'month', day: string) => navigate(`/wrapped/${period}?at=${day}`);
  const monthName = dayStart(cursor).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) => dayStart(addDays('2024-01-01', i)).toLocaleDateString(lang, { weekday: 'short' }));

  useEffect(() => {
    // Picking a day in another month takes the month view there.
    if (selected.slice(0, 7) !== cursor.slice(0, 7) && prefs.view !== 'month') setCursor(selected.slice(0, 7) + '-01');
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-dvh px-4 pt-4 pb-10 safe-top safe-bottom md:px-5">
      <PageHeader
        title={tr("Blacktop Calendar")}
        backTo="/"
        right={
          <HeaderButton data-tip="cal-export" onClick={() => void exportIcs(crew.events)} aria-label={tr("Add to your phone's calendar")}>
            <Download className="w-4 h-4" />
          </HeaderButton>
        }
      />

      {/* In landscape: the clock, the controls and the chosen day on the left, the month (or week, or list) on the right. */}
      <div className="short:grid short:grid-cols-2 short:gap-x-4 short:items-start">
      <div className="short:col-start-1">
      <CalendarClock />

      {/* Month, week or list. */}
      <div role="tablist" className="relative grid grid-cols-3 gap-1 rounded-xl border border-accent/40 bg-background/60 p-0.5 mb-2.5">
        <SlidingPill />
        {(
          [
            ['month', tr("Month")],
            ['week', tr("Week")],
            ['list', tr("Coming up")],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={prefs.view === v} onClick={() => setPrefs({ view: v })} className={cn('tall-hit relative z-[1] rounded-lg py-2 text-xs font-semibold transition-colors duration-300', prefs.view === v ? 'text-accent-foreground' : 'text-accent/80')}>
            {label}
          </button>
        ))}
      </div>

      {/* What's shown. */}
      <div data-tip="cal-filters" className="flex flex-wrap gap-1.5 mb-3">
        {CAL_FILTERS.map((f) => {
          const on = prefs.filters.includes(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setPrefs({ filters: on ? prefs.filters.filter((x) => x !== f) : [...prefs.filters, f] })}
              className={cn('h-8 px-3 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-colors duration-300', on ? 'text-foreground' : 'border-border/60 text-muted-foreground')}
              style={on ? { borderColor: FILTER_COLORS[f][0], backgroundColor: `color-mix(in srgb, ${FILTER_COLORS[f][0]} 16%, transparent)` } : undefined}
            >
              {/* The same dots the days carry. */}
              <span aria-hidden className="inline-flex gap-[2px]">
                {FILTER_COLORS[f].map((c) => (
                  <span key={c} className={cn('w-[6px] h-[6px] rounded-full', !on && 'opacity-50')} style={{ backgroundColor: c }} />
                ))}
              </span>
              {filterName(f)}
            </button>
          );
        })}
        <button type="button" aria-pressed={prefs.weather} onClick={() => setPrefs({ weather: !prefs.weather })} className={cn('h-8 px-3 rounded-lg text-[11px] font-semibold border', prefs.weather ? 'bg-accent/15 border-accent/60' : 'border-border/60 text-muted-foreground')}>
          {tr("Weather")}
        </button>
        <button type="button" aria-pressed={prefs.heat} onClick={() => setPrefs({ heat: !prefs.heat })} className={cn('h-8 px-3 rounded-lg text-[11px] font-semibold border', prefs.heat ? 'bg-accent/15 border-accent/60' : 'border-border/60 text-muted-foreground')}>
          {tr("Heat map")}
        </button>
      </div>

      {prefs.weather && pick && (
        <button type="button" onClick={() => select(pick.day)} className="w-full mb-3 rounded-2xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 flex items-center gap-2.5 text-left">
          <Sun className="w-5 h-5 text-accent shrink-0" />
          <span className="text-[13px] font-semibold">
            {tr("Pick of the week: {0}", [dayStart(pick.day).toLocaleDateString(lang, { weekday: 'long' })])}
          </span>
        </button>
      )}

      </div>

      <div className="short:col-start-2 short:row-start-1 short:row-span-2 min-w-0">
      {prefs.view === 'month' && (
        <section ref={gridRef} {...swipe} data-tip="cal-month" className="touch-pan-y select-none" aria-label={monthName}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => step(-1)} aria-label={tr("Previous month")} className="glove-hit h-9 w-9 rounded-xl frost-accent inline-flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => openWrapped('month', cursor)} data-tip="cal-wrapped" className="text-base font-semibold capitalize underline decoration-dotted decoration-accent/50 underline-offset-4 touch-target px-2">
              {monthName}
            </button>
            <button type="button" onClick={() => step(1)} aria-label={tr("Next month")} className="glove-hit h-9 w-9 rounded-xl frost-accent inline-flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {weekdays.map((w) => (
              <span key={w} className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground py-1">{w}</span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, row) => {
            const monday = addDays(gridStart, row * 7);
            const ridden = data.rideWeeks.has(monday);
            const isThis = monday === thisWeek;
            return (
              <div key={monday}>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: 7 }, (_, c) => {
                    const k = addDays(monday, c);
                    return (
                      <DayCell
                        key={k}
                        day={k}
                        outside={k.slice(0, 7) !== cursor.slice(0, 7)}
                        today={k === today}
                        selected={k === selected}
                        events={shown(k)}
                        weather={prefs.weather ? forecast.get(k) ?? null : null}
                        heat={prefs.heat ? (data.heat.get(k) ?? 0) / maxHeat : 0}
                        onPick={() => select(k)}
                        onHold={() => {
                          select(k, false);
                          setAdding(k);
                        }}
                      />
                    );
                  })}
                </div>
                {/* The streak: a road's centre line along each week ridden, joined week to week; this week's glows. */}
                <div className="h-2 my-0.5 flex items-center">
                  {ridden ? (
                    <button
                      type="button"
                      onClick={() => openWrapped('week', monday)}
                      aria-label={tr("That week's Wrapped")}
                      className="block w-full py-1 -my-1"
                    >
                    <span
                      className={cn('block w-full h-[3px] rounded-full', isThis && 'shadow-[0_0_8px_hsl(var(--accent))]')}
                      style={{ backgroundImage: `repeating-linear-gradient(90deg, ${isThis ? 'hsl(var(--accent))' : 'hsl(0 0% 92%)'} 0 14px, transparent 14px 24px)` }}
                    />
                    </button>
                  ) : isThis && atRisk ? (
                    <span className="block w-full h-[3px] rounded-full opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, hsl(0 0% 92%) 0 6px, transparent 6px 24px)' }} />
                  ) : null}
                </div>
              </div>
            );
          })}
          {streak.size >= 2 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {atRisk ? tr("{0}-week streak: ride by Sunday to keep it going", [streak.size]) : tr("{0} weeks in a row", [streak.size])}
            </p>
          )}
          {prefs.heat && <p className="mt-1 text-[11px] text-muted-foreground">{tr("Shaded by distance ridden; the most in a day here: {0}", [milesText(maxHeat)])}</p>}
        </section>
      )}

      {prefs.view === 'week' && (
        <section ref={gridRef} {...swipe} className="touch-pan-y">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => step(-1)} aria-label={tr("Previous week")} className="glove-hit h-9 w-9 rounded-xl frost-accent inline-flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => openWrapped('week', weekStart)} className="text-sm font-semibold underline decoration-dotted decoration-accent/50 underline-offset-4 touch-target px-2">
              {dayStart(weekStart).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} – {dayStart(addDays(weekStart, 6)).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}
            </button>
            <button type="button" onClick={() => step(1)} aria-label={tr("Next week")} className="glove-hit h-9 w-9 rounded-xl frost-accent inline-flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const k = addDays(weekStart, i);
              const w = prefs.weather ? forecast.get(k) : undefined;
              const W = w ? verdictIcon(w.verdict) : null;
              const list = shown(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => select(k)}
                    className={cn('w-full text-left rounded-2xl border px-3 py-2.5 flex items-start gap-3', k === selected ? 'border-accent bg-accent/10' : 'frost border-border/60')}
                  >
                    <span className={cn('w-10 shrink-0 text-center rounded-lg py-1', k === today && 'bg-[hsl(var(--lava,var(--accent)))] text-[hsl(0_0%_6%)]')}>
                      <span className="block text-[10px] font-semibold uppercase">{dayStart(k).toLocaleDateString(lang, { weekday: 'short' })}</span>
                      <span className="block font-mono font-bold">{dayStart(k).getDate()}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      {list.length ? (
                        list.slice(0, 3).map((e) => (
                          <span key={e.id} className="flex items-center gap-1.5 text-[13px] truncate">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} /> <span className="truncate">{e.title}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">{tr("Nothing on")}</span>
                      )}
                      {list.length > 3 && <span className="text-[11px] text-muted-foreground">{tr("+{0} more", [list.length - 3])}</span>}
                    </span>
                    {W && <W className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-label={w!.verdict} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {prefs.view === 'list' && (
        <section>
          {(() => {
            const days: string[] = [];
            for (let k = today; k <= addDays(today, 60); k = addDays(k, 1)) {
              if (shown(k).some((e) => e.kind !== 'memory' && e.kind !== 'challenge' && e.kind !== 'crewGoal')) days.push(k);
            }
            if (!days.length) return <p className="rounded-2xl frost border border-border/60 p-3.5 text-sm text-muted-foreground">{tr("Nothing coming up. Hold a day to add a plan or a reminder.")}</p>;
            return (
              <ul className="space-y-2">
                {days.map((k) => (
                  <li key={k}>
                    <button type="button" onClick={() => { select(k); setPrefs({ view: 'month' }); setCursor(k.slice(0, 7) + '-01'); }} className="w-full text-left rounded-2xl frost border border-border/60 px-3 py-2.5">
                      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                        {k === today ? tr("Today") : k === addDays(today, 1) ? tr("Tomorrow") : dayStart(k).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' })}
                      </span>
                      {shown(k)
                        .filter((e) => e.kind !== 'memory' && e.kind !== 'challenge' && e.kind !== 'crewGoal')
                        .map((e) => (
                          <span key={e.id} className="flex items-center gap-1.5 text-[13px]">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>
      )}

      </div>

      <div ref={panelRef} className="short:col-start-1 min-w-0 scroll-mt-4">
      {prefs.view !== 'list' && (
        <DayPanel
          day={selected}
          events={shown(selected)}
          weather={prefs.weather ? forecast.get(selected) ?? null : null}
          sun={spot ? sunTimes(dayStart(selected), spot.lat, spot.lng) : null}
          onAdd={() => setAdding(selected)}
        />
      )}

      </div>
      </div>

      <PageTips
        page="calendar-wrapped"
        when={!adding && prefs.view === 'month'}
        tips={[{ target: '[data-tip="cal-wrapped"]', text: tr("Tap the month, or the road under a week you rode, for its Wrapped.") }]}
      />
      <PageTips
        page="calendar"
        when={!adding}
        max={4}
        scroll
        tips={[
          { target: '[data-tip="cal-clock-modes"]', text: tr("Switch the clock to a stopwatch here. It keeps running when you leave the page.") },
          { target: '[data-tip="cal-filters"]', text: tr("Show or hide each kind. The dots on the days are the same colours.") },
          { target: '[data-tip="cal-month"]', text: tr("Hold a day to add a ride plan, a reminder, a Track Day or a crew plan. Swipe sideways for other months.") },
          { target: '[data-tip="cal-export"]', text: tr("Add it all to your phone's own calendar.") },
        ]}
      />
      {adding && <AddSheet day={adding} open={!!adding} onOpenChange={(o) => !o && setAdding(null)} crewPlans={crew.available} />}
    </div>
  );
}

/** One day in the month: its number, its weather, a dot for each thing on it (three at most, then +n). Hold to add. */
function DayCell({
  day,
  outside,
  today,
  selected,
  events,
  weather,
  heat,
  onPick,
  onHold,
}: {
  day: string;
  outside: boolean;
  today: boolean;
  selected: boolean;
  events: CalEvent[];
  weather: { verdict: import('@/features/calendar/lib/dailyForecast').DayVerdict } | null;
  heat: number;
  onPick: () => void;
  onHold: () => void;
}) {
  const hold = useHoldTap(onPick, onHold, 600);
  const W = weather ? verdictIcon(weather.verdict) : null;
  const dots = [...new Map(events.map((e) => [e.color + e.kind, e])).values()];
  return (
    <button
      type="button"
      {...hold.handlers}
      aria-pressed={selected}
      aria-label={`${dayStart(day).toLocaleDateString()}${events.length ? ` · ${events.length}` : ''}`}
      className={cn(
        'hold-target relative min-h-[54px] rounded-xl flex flex-col items-center justify-start gap-0.5 py-1 transition-colors',
        selected ? 'ring-2 ring-accent' : '',
        outside && 'opacity-40',
      )}
      // Up and down still scroll the page (hold-target alone stops all touch moves, and the grid is
      // nearly all cells); a scroll cancels the hold, and a sideways swipe is the grid's month step.
      style={{ touchAction: 'pan-y', ...(heat > 0 ? { backgroundColor: `hsl(var(--accent) / ${0.08 + heat * 0.42})` } : {}) }}
    >
      <span
        className={cn(
          'font-mono text-[13px] font-semibold leading-none w-6 h-6 rounded-md flex items-center justify-center',
          today && 'bg-[hsl(var(--lava,var(--accent)))] text-[hsl(0_0%_6%)] font-black',
        )}
      >
        {dayStart(day).getDate()}
      </span>
      <span className="h-3 flex items-center" aria-hidden>{W && <W className="w-3 h-3 text-muted-foreground" />}</span>
      <span className="h-[6px] flex justify-center items-center gap-[3px]" aria-hidden>
        {dots.slice(0, 3).map((e) => (
          <span key={e.id} className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: e.color }} />
        ))}
        {dots.length > 3 && <span className="text-[8px] leading-none text-muted-foreground">+{dots.length - 3}</span>}
      </span>
      {hold.holding && <span aria-hidden className="absolute inset-0 rounded-xl ring-2 ring-[hsl(var(--lava,var(--accent)))] animate-pulse" />}
    </button>
  );
}
