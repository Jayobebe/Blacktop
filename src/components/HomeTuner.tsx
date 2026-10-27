import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarRange,
  Earth,
  Flag,
  Globe2,
  Hand,
  History,
  IdCard,
  Route,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useProfile } from '@/features/profile';
import { useRideHistory } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { useProximityState, setProximityState } from '@/features/proximity';
import { useCardDrops } from '@/features/cards';
import { openBlacktopMap } from '@/features/map';
import { travelTime } from '@/features/map/lib/eta';
import { knownSpot, metresBetween } from '@/features/console/lib/whereRider';
import { sunTimes } from '@/features/calendar/lib/sun';
import { channelName, setTunerHidden, TUNER_CHANNELS, useTunerHidden, type TunerChannelId } from '@/lib/homeTuner';
import { metresText, milesText, speedText } from '@/lib/units';
import { isThermal } from '@/lib/thermal';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import type { RideSession } from '@/types/blacktop';

/**
 * Home's tuner strip, in the header's place (lib/homeTuner for the rider's
 * channels): every channel in full, one after another round a loop, gliding
 * along at a reading pace under a fixed needle (notches on the top and bottom
 * edges, never over the words), the words fading out at either edge. A drag
 * moves it, a flick sends it and it eases back to the glide; a tap acts on
 * the channel under the finger. Held, it opens the channel list.
 * Only channels with something to say are on it, and only things the Console
 * doesn't already show. Still under Thermal mode and reduced motion (a swipe
 * still turns it). Anything read from the server is read only while `active`.
 */

interface Channel {
  id: TunerChannelId;
  label: string;
  value: string;
  /** In place of the channel's usual icon (sunrise, charging). */
  icon?: LucideIcon;
  onTap?: () => void;
}

/** Each channel's icon, drawn in the second accent (`.text-accent-2`). */
const ICON: Record<TunerChannelId, LucideIcon> = {
  welcome: Hand,
  sun: Sunset,
  daylight: Sun,
  lastride: History,
  riding: Globe2,
  yearago: CalendarClock,
  year: CalendarRange,
  total: Route,
  earth: Earth,
  saddle: Timer,
  next: Flag,
  best: Trophy,
  near: Users,
  drops: IdCard,
};

/** The glide, px a millisecond (about 30 px a second: a reading pace). */
const CRUISE = 0.03;
const HOLD_MS = 600;
const DAY_MS = 86_400_000;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The next round figure above `v` (in the rider's units): 100, 250, 500, 1,000, 1,500, 2,000, 2,500, 3,000, 4,000, 5,000… */
function nextMilestone(v: number): number {
  const steps = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
  for (const s of steps) if (v < s) return s;
  return (Math.floor(v / 5000) + 1) * 5000;
}

function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function HomeTuner({ active, className }: { active: boolean; className?: string }) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { rides, stats } = useRideHistory();
  const { settings } = useSettings();
  const exp = useExperience();
  const terms = exp.terms;
  const hidden = useTunerHidden();
  const unit = settings.distanceUnit === 'km' ? 'km' : 'miles';

  // Where the rider is, without asking for a fix (the map's last view or the parked spot).
  const spot = useMemo(() => knownSpot(), [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // A minute's clock, for the sun and the day's rotations.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [active]);

  // Riding now worldwide: the count Blacktop World's globe reads (same query, shared).
  const worldOn = settings.blacktopWorldEnabled;
  const { data: presence } = useQuery({
    queryKey: ['world-locations'],
    enabled: worldOn && active,
    staleTime: 5 * 60_000,
    refetchInterval: active ? 5 * 60_000 : false,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_world_presence');
      return (data ?? []) as Array<{ lat: number; lng: number }>;
    },
  });


  // Riders near by (only with nearby riders on) and card drops near by (collectors only).
  const proximity = useProximityState();
  const dropsOn = settings.blacktopWorldEnabled && settings.collectiblesEnabled;
  const { drops } = useCardDrops(dropsOn && active ? spot : null);

  const channels = useMemo<Channel[]>(() => {
    const out: Channel[] = [];
    const finished = rides.filter((r: RideSession) => r.endedAt && r.distance > 0);

    // Welcome.
    if (profile.name) {
      out.push({ id: 'welcome', label: stats.totalRides === 0 ? tr("Welcome") : tr("Welcome back"), value: profile.name });
    }

    // The sun: daylight left, or when it's up again.
    if (spot) {
      const today = sunTimes(new Date(now), spot.lat, spot.lng);
      const tomorrow = sunTimes(new Date(now + DAY_MS), spot.lat, spot.lng);
      if (today.rise !== null && today.set !== null) {
        if (now < today.rise) {
          out.push({ id: 'sun', icon: Sunrise, label: tr("Sunrise"), value: tr("{0} · in {1}", [clock(today.rise), travelTime((today.rise - now) / 1000, null)]) });
        } else if (now < today.set) {
          out.push({
            id: 'sun',
            label: tr("Sunset"),
            value: tr("{0} · in {1}", [clock(today.set), travelTime((today.set - now) / 1000, null)]),
          });
        } else if (tomorrow.rise !== null) {
          out.push({ id: 'sun', icon: Sunrise, label: tr("Sunrise"), value: clock(tomorrow.rise) });
        }
      }
    }

    // Daylight today, and how it's changing.
    if (spot) {
      const len = (d: number) => {
        const t = sunTimes(new Date(d), spot.lat, spot.lng);
        return t.rise !== null && t.set !== null ? t.set - t.rise : null;
      };
      const today = len(now);
      const yesterday = len(now - DAY_MS);
      if (today !== null) {
        const hm = (ms: number) => tr("{0} h {1} min", [Math.floor(ms / 3600_000), Math.round((ms % 3600_000) / 60_000)]);
        const diff = yesterday !== null ? Math.round((today - yesterday) / 60_000) : 0;
        out.push({
          id: 'daylight',
          label: tr("Daylight"),
          value:
            diff > 0
              ? tr("{0} · {1} min more than yesterday", [hm(today), diff])
              : diff < 0
                ? tr("{0} · {1} min less than yesterday", [hm(today), -diff])
                : hm(today),
        });
      }
    }

    // The last ride: when, and how far.
    const last = [...finished].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (last) {
      const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(last.startedAt).setHours(0, 0, 0, 0)) / DAY_MS);
      const when = days <= 0 ? tr("Today") : days === 1 ? tr("Yesterday") : tr("{0} days ago", [days]);
      out.push({ id: 'lastride', label: tr("Last ride"), value: tr("{0} · {1}", [when, milesText(last.distance, unit)]), onTap: () => navigate(`/ride/${last.id}`) });
    }

    // All time (rides burned from history still count), how far round the world that is, and time in the saddle.
    if (stats.totalDistance > 0) {
      const shown = unit === 'km' ? stats.totalDistance * 1.609344 : stats.totalDistance;
      const goal = nextMilestone(shown);
      const left = unit === 'km' ? (goal - shown) / 1.609344 : goal - shown;
      const goalMiles = unit === 'km' ? goal / 1.609344 : goal;
      out.push({ id: 'total', label: tr("All time"), value: tr("{0} · {1} to {2}", [milesText(stats.totalDistance, unit), milesText(left, unit), milesText(goalMiles, unit)]), onTap: () => navigate('/stats') });
      const laps = stats.totalDistance / 24_901;
      if (stats.totalDistance >= 25) {
        out.push({
          id: 'earth',
          label: tr("Round the world"),
          value: laps >= 1 ? tr("{0} times round", [laps.toFixed(1)]) : tr("{0}% of the way", [(laps * 100).toFixed(laps < 0.1 ? 1 : 0)]),
          onTap: () => navigate('/stats'),
        });
      }
    }
    if (stats.totalDuration >= 3600) {
      out.push({ id: 'saddle', label: terms.car ? tr("Behind the wheel") : tr("In the saddle"), value: tr("{0} h all told", [Math.floor(stats.totalDuration / 3600).toLocaleString()]), onTap: () => navigate('/stats') });
    }
    if (stats.totalRides > 0) {
      const marks = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
      const mark = marks.find((m) => m > stats.totalRides) ?? (Math.floor(stats.totalRides / 500) + 1) * 500;
      const left = mark - stats.totalRides;
      out.push({ id: 'next', label: tr("Coming up"), value: left === 1 ? tr("Your next one is number {0}", [mark]) : tr("{0} more to number {1}", [left, mark]) });
    }

    // Riding now, worldwide.
    if (worldOn && presence && presence.length > 0) {
      out.push({ id: 'riding', label: tr("Riding now"), value: tr("{0} worldwide", [presence.length.toLocaleString()]), onTap: () => navigate('/world') });
    }

    // On this day: the latest year with a ride on today's date.
    const today = new Date(now);
    const sameDay = finished
      .filter((r) => {
        const d = new Date(r.startedAt);
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() < today.getFullYear();
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (sameDay) {
      const years = today.getFullYear() - new Date(sameDay.startedAt).getFullYear();
      out.push({
        id: 'yearago',
        label: years === 1 ? tr("A year ago") : tr("{0} years ago", [years]),
        value: sameDay.name ? tr("{0} · {1}", [sameDay.name, milesText(sameDay.distance, unit)]) : milesText(sameDay.distance, unit),
        onTap: () => navigate(`/ride/${sameDay.id}`),
      });
    }

    // This year, and the next round figure.
    const thisYear = finished.filter((r) => new Date(r.startedAt).getFullYear() === today.getFullYear()).reduce((s, r) => s + r.distance, 0);
    if (thisYear > 0) {
      const shown = unit === 'km' ? thisYear * 1.609344 : thisYear;
      const goal = nextMilestone(shown);
      const left = unit === 'km' ? (goal - shown) / 1.609344 : goal - shown;
      const goalMiles = unit === 'km' ? goal / 1.609344 : goal;
      out.push({
        id: 'year',
        label: tr("This year"),
        value: tr("{0} · {1} to {2}", [milesText(thisYear, unit), milesText(left, unit), milesText(goalMiles, unit)]),
        onTap: () => navigate('/stats'),
      });
    }

    // A personal best, a different one each day.
    const bests: Channel[] = [];
    const longest = finished.reduce<RideSession | null>((a, r) => (!a || r.distance > a.distance ? r : a), null);
    if (longest) bests.push({ id: 'best', label: tr("Longest ride"), value: milesText(longest.distance, unit), onTap: () => navigate(`/ride/${longest.id}`) });
    if (settings.speedFocusEnabled) {
      const fastest = finished.filter((r) => r.distance >= 5 && r.averageSpeed > 0).reduce<RideSession | null>((a, r) => (!a || r.averageSpeed > a.averageSpeed ? r : a), null);
      if (fastest) bests.push({ id: 'best', label: tr("Best average"), value: speedText(fastest.averageSpeed), onTap: () => navigate(`/ride/${fastest.id}`) });
    }
    const weeks = new Map<number, number>();
    for (const r of finished) {
      const w = weekStart(new Date(r.startedAt).getTime());
      weeks.set(w, (weeks.get(w) ?? 0) + r.distance);
    }
    const bestWeek = Math.max(0, ...weeks.values());
    if (weeks.size > 1 && bestWeek > 0) bests.push({ id: 'best', label: tr("Best week"), value: milesText(bestWeek, unit), onTap: () => navigate('/stats') });
    if (bests.length) out.push(bests[Math.floor(now / DAY_MS) % bests.length]);


    // Riders out near by.
    if (settings.proximityEnabled && proximity.riders.length > 0) {
      const n = proximity.riders.length;
      out.push({
        id: 'near',
        label: tr("Near you"),
        value: n === 1 ? tr("1 rider out") : tr("{0} riders out", [n]),
        onTap: () => {
          openBlacktopMap();
          setProximityState({ panel: 'list' });
        },
      });
    }

    // Card drops near by, not collected yet.
    if (dropsOn && spot) {
      const near = drops.filter((d) => !d.collected && !d.isOwn && metresBetween(spot, d) <= 5000).length;
      if (near > 0) out.push({ id: 'drops', label: tr("Card drops"), value: near === 1 ? tr("1 within {0}", [metresText(5000, 0, unit)]) : tr("{0} within {1}", [near, metresText(5000, 0, unit)]), onTap: () => openBlacktopMap() });
    }

    return out.filter((c) => !hidden.includes(c.id)).sort((a, b) => TUNER_CHANNELS.indexOf(a.id) - TUNER_CHANNELS.indexOf(b.id));
  }, [rides, stats.totalRides, stats.totalDistance, stats.totalDuration, terms.car, profile.name, spot, now, worldOn, presence, unit, settings.speedFocusEnabled, settings.proximityEnabled, proximity.riders.length, dropsOn, drops, hidden, navigate]);

  const [editing, setEditing] = useState(false);
  return (
    <>
      <TunerStrip channels={channels} active={active} onHold={() => setEditing(true)} className={className} />
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom">
          <SheetHeader>
            <SheetTitle>{tr("On the tuner")}</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1 mb-3">{tr("Each shows only when it has something to say.")}</p>
          <div className="divide-y divide-border/40">
            {TUNER_CHANNELS.map((id) => (
              <label key={id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">{channelName(id)}</span>
                <Switch checked={!hidden.includes(id)} onCheckedChange={(on) => setTunerHidden(id, !on)} />
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The strip itself: every channel in full, gliding along a loop under the needle. */
function TunerStrip({ channels, active, onHold, className }: { channels: Channel[]; active: boolean; onHold: () => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const still = isThermal() || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const n = channels.length;
  // Copies of the channel list side by side, enough that the window never runs off the end.
  const [copies, setCopies] = useState(4);
  // Position in px along the track; velocity in px/ms (the glide is CRUISE).
  const s = useRef({ pos: 0, vel: CRUISE, lap: 0, base: 1, drag: null as null | { x: number; pos: number; moved: number; hist: Array<[number, number]>; at: number } });
  const holdTimer = useRef<number | null>(null);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;
  const activeRef = useRef(active);
  activeRef.current = active;
  const ids = channels.map((c) => `${c.id}:${c.value}`).join('|');

  useEffect(() => {
    const el = box.current;
    const tr0 = track.current;
    if (!el || !tr0 || n === 0) return;
    const st = s.current;
    // One lap is one copy of the channels; wide enough, the loop is seamless.
    const measure = () => {
      const kids = Array.from(tr0.children) as HTMLElement[];
      const one = kids.slice(0, n).reduce((w, k) => w + k.offsetWidth, 0);
      st.lap = one;
      // The position stays within one lap, [base, base + 1) laps in, with `base` laps of copies before it and
      // as many after, so half the strip's width either side of the needle is always covered.
      st.base = one > 0 ? Math.max(1, Math.ceil(el.clientWidth / 2 / one)) : 1;
      const need = st.base * 2 + 2;
      if (need !== copies) setCopies(need);
      if (!st.pos) st.pos = one * st.base;
    };
    measure();
    let raf = 0;
    let last = performance.now();
    const place = () => {
      const lap = st.lap;
      if (lap > 0) {
        // Round the loop a lap at a time (a drag's start goes with it).
        const lo = lap * st.base;
        const shift = st.pos < lo ? lap : st.pos >= lo + lap ? -lap : 0;
        if (shift) {
          st.pos += shift;
          if (st.drag) st.drag.pos += shift;
        }
      }
      tr0.style.transform = `translateX(${el.clientWidth / 2 - st.pos}px)`;
    };
    const fits = () => n === 1 && st.lap <= el.clientWidth;
    const frame = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      if (!st.drag) {
        if (fits()) {
          st.pos = st.lap * st.base + st.lap / 2;
          st.vel = 0;
        } else {
          // Ease back to the glide (forwards, whichever way a flick sent it); still under Thermal mode and less motion.
          const cruise = still || !activeRef.current ? 0 : CRUISE;
          st.vel += (cruise - st.vel) * Math.min(1, dt / 900);
          st.pos += st.vel * dt;
        }
      }
      place();
      const moving = st.drag || Math.abs(st.vel) > 0.0005 || (!still && activeRef.current && !fits());
      raf = moving ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    place();
    kick();
    const down = (e: PointerEvent) => {
      st.drag = { x: e.clientX, pos: st.pos, moved: 0, hist: [[e.clientX, performance.now()]], at: performance.now() };
      st.vel = 0;
      el.setPointerCapture(e.pointerId);
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        if (st.drag && st.drag.moved < 6) {
          st.drag = null;
          haptics.light();
          onHoldRef.current();
          kick();
        }
      }, HOLD_MS);
      kick();
    };
    const move = (e: PointerEvent) => {
      const d = st.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      d.moved = Math.max(d.moved, Math.abs(dx));
      st.pos = d.pos - dx;
      d.hist.push([e.clientX, performance.now()]);
      if (d.hist.length > 5) d.hist.shift();
    };
    const up = (e: PointerEvent) => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      const d = st.drag;
      if (!d) return;
      st.drag = null;
      if (d.moved < 6) {
        // A tap: the channel under the finger.
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-ch]');
        const i = hit ? Number(hit.getAttribute('data-ch')) : -1;
        const c = i >= 0 ? channelsRef.current[i % n] : undefined;
        if (c?.onTap) {
          haptics.tick();
          c.onTap();
        }
      } else {
        const a = d.hist[0];
        const b = d.hist[d.hist.length - 1];
        st.vel = still ? 0 : -(b[0] - a[0]) / Math.max(16, b[1] - a[1]);
      }
      kick();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    const onResize = () => {
      measure();
      place();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('resize', onResize);
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    };
  }, [n, ids, active, still, copies]);

  const loop = Array.from({ length: n > 0 ? copies : 0 }, () => channels).flat();
  return (
    <div
      ref={box}
      data-tip="home-tuner"
      data-no-swipe
      role="group"
      aria-roledescription={tr("Tuner")}
      className={cn(
        'hold-target relative h-12 rounded-2xl border border-accent/35 bg-card/60 overflow-hidden select-none touch-pan-y cursor-grab',
        className,
      )}
    >
      {/* The words fade out at either edge. */}
      <div className="absolute inset-0 [mask-image:linear-gradient(90deg,transparent,black_14%,black_86%,transparent)]">
        <div ref={track} className="absolute inset-y-0 left-0 flex will-change-transform">
          {loop.map((c, i) => {
            const Icon = c.icon ?? ICON[c.id];
            return (
              <div key={`${c.id}-${i}`} data-ch={i} className="h-full shrink-0 flex items-center gap-2 pl-5 whitespace-nowrap">
                <Icon aria-hidden className="w-4 h-4 shrink-0 text-accent-2" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</span>
                <span className="text-[15px] font-semibold">{c.value}</span>
                {/* A faint mark between channels. */}
                <span aria-hidden className="ml-5 w-1 h-1 rounded-full bg-muted-foreground/40" />
              </div>
            );
          })}
        </div>
      </div>
      {/* The needle: notches at the top and bottom edges, clear of the words. */}
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-accent" />
      <span aria-hidden className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[6px] border-b-accent" />
    </div>
  );
}

export default HomeTuner;
