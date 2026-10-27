import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { X, Share2, Route as RouteIcon, Timer, Trophy, MapPin, Gauge, CalendarDays, Award, Users, Sparkles } from 'lucide-react';
import { useRideHistory, usePeaksHidden, PEAK_HIDDEN } from '@/features/ride';
import { firstRideAt, markWrappedSeen, wrappedRange, wrapUp, WRAPPED_PERIODS, type WrappedData, type WrappedPeriod } from '@/features/ride/lib/wrapped';
import { BADGE_ICON } from '@/features/ride/lib/badgeIcons';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { BADGE_INFO, type BadgeType } from '@/types/convoy';
import { milesText, speedText } from '@/lib/units';
import { shareFileNative } from '@/lib/nativeShare';
import { isThermal } from '@/lib/thermal';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr, getLanguage } from '@/lib/i18n';

/**
 * Wrapped (features/ride/lib/wrapped): a week, a month, a year or all time
 * played as story slides you tap through (left third back, the rest on; held,
 * it waits), each moving on by itself after a few seconds: how far, how long,
 * the longest ride drawn from its own track, the towns ridden through, speed
 * and lean (never a peak the rider keeps private), the rider's day and time of
 * day, badges, and a share card at the end (an image through the share sheet,
 * or a download). `/wrapped/:period?at=YYYY-MM-DD` picks the period with that
 * day in it (today's by default). Opening a finished one marks it seen, which
 * stops Stats glowing on Home's nav bar.
 */

const SLIDE_MS = 6000;

const fmtHours = (s: number) => tr("{0} h {1} min", [Math.floor(s / 3600), Math.round((s % 3600) / 60)]);

export default function Wrapped() {
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const period: WrappedPeriod = WRAPPED_PERIODS.includes(params.period as WrappedPeriod) ? (params.period as WrappedPeriod) : 'week';
  const at = search.get('at');
  const { rides } = useRideHistory();
  const { settings } = useSettings();
  const exp = useExperience();
  const peaksHidden = usePeaksHidden();
  const lang = getLanguage();

  const data = useMemo(() => {
    const day = at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? new Date(`${at}T12:00:00`) : new Date();
    return wrapUp(rides, wrappedRange(period, day, firstRideAt(rides)));
  }, [rides, period, at]);
  const ongoing = data.end > Date.now();

  useEffect(() => {
    if (!ongoing && data.count > 0) markWrappedSeen(data);
  }, [data, ongoing]);

  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/stats');
  };

  const title = periodTitle(data, lang);
  const kicker = periodKicker(period, ongoing, exp.terms.car);
  const slides = buildSlides(data, { title, kicker, period, ongoing, lang, unit: settings.distanceUnit === 'km' ? 'km' : 'miles', speed: settings.speedFocusEnabled, lean: exp.canLean && settings.leanAngleEnabled, badges: settings.collectiblesEnabled, peaksHidden, car: exp.terms.car });

  // The story: one slide at a time, moving on by itself; a hold waits.
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const still = isThermal();
  useEffect(() => setIndex(0), [data.key, period]);
  useEffect(() => {
    if (held || index >= slides.length - 1) return;
    const t = window.setTimeout(() => setIndex((i) => Math.min(slides.length - 1, i + 1)), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, held, slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === ' ') setIndex((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const tap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    haptics.tick();
    if (e.clientX - r.left < r.width / 3) setIndex((i) => Math.max(0, i - 1));
    else setIndex((i) => Math.min(slides.length - 1, i + 1));
  };

  return (
    <div className="fixed inset-0 z-[60] radio-mica safe-frame flex flex-col no-frost">
      {/* Progress: a bar a slide, the one on filling over its time. */}
      <div className="flex gap-1 px-3 pt-3">
        {slides.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
            <div
              key={`${i}-${index}-${held}`}
              className={cn('h-full bg-white rounded-full', i < index || (still && i === index) ? 'w-full' : i > index ? 'w-0' : held ? 'w-0' : 'wrapped-fill')}
              style={i === index && !still && !held && index < slides.length - 1 ? { animationDuration: `${SLIDE_MS}ms` } : i === index && index === slides.length - 1 ? { width: '100%' } : undefined}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 pt-2">
        <h1 className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">{tr("Blacktop Wrapped")}</h1>
        <button type="button" onClick={close} aria-label={tr("Close")} className="glove-hit w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        role="region"
        aria-roledescription={tr("Story")}
        aria-label={title}
        className="flex-1 min-h-0 select-none hold-target"
        onClick={tap}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
      >
        <div key={index} className={cn('h-full px-6 py-6 flex flex-col justify-center gap-4 max-w-md mx-auto short:max-w-2xl', !still && 'animate-fade-in')}>
          {slides[index]}
        </div>
      </div>
    </div>
  );
}

// ── Words for a period ───────────────────────────────────────────────────────

function periodTitle(d: WrappedData, lang: string): string {
  const start = new Date(d.start);
  if (d.period === 'week') {
    const end = new Date(d.end - 86_400_000);
    return `${start.toLocaleDateString(lang, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`;
  }
  if (d.period === 'month') return start.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
  if (d.period === 'year') return String(start.getFullYear());
  return tr("All time");
}

function periodKicker(p: WrappedPeriod, ongoing: boolean, car: boolean): string {
  if (p === 'all') return car ? tr("Your driving so far") : tr("Your riding so far");
  if (p === 'week') return ongoing ? tr("Your week so far") : tr("Your week");
  if (p === 'month') return ongoing ? tr("Your month so far") : tr("Your month");
  return ongoing ? tr("Your year so far") : tr("Your year");
}

function comparison(d: WrappedData): string | null {
  if (!d.previous || d.previous.distance <= 0) return null;
  const pct = Math.round(((d.distance - d.previous.distance) / d.previous.distance) * 100);
  if (pct === 0) return d.period === 'week' ? tr("The same as the week before.") : d.period === 'month' ? tr("The same as the month before.") : tr("The same as the year before.");
  const n = Math.abs(pct);
  if (pct > 0) return d.period === 'week' ? tr("{0}% more than the week before.", [n]) : d.period === 'month' ? tr("{0}% more than the month before.", [n]) : tr("{0}% more than the year before.", [n]);
  return d.period === 'week' ? tr("{0}% less than the week before.", [n]) : d.period === 'month' ? tr("{0}% less than the month before.", [n]) : tr("{0}% less than the year before.", [n]);
}

// ── The slides ───────────────────────────────────────────────────────────────

interface Opts {
  title: string;
  kicker: string;
  period: WrappedPeriod;
  ongoing: boolean;
  lang: string;
  unit: 'miles' | 'km';
  speed: boolean;
  lean: boolean;
  badges: boolean;
  peaksHidden: boolean;
  car: boolean;
}

function Big({ icon: Icon, label, value, sub }: { icon: typeof Trophy; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <Icon className="w-10 h-10 text-accent-2" aria-hidden />
      <p className="text-xs uppercase tracking-[0.25em] text-white/60">{label}</p>
      <p className="text-5xl short:text-4xl font-black tracking-tight leading-none">{value}</p>
      {sub && <p className="text-base text-white/80">{sub}</p>}
    </>
  );
}

function buildSlides(d: WrappedData, o: Opts): ReactNode[] {
  if (d.count === 0) {
    return [
      <div key="empty" className="text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">{o.kicker}</p>
        <p className="text-3xl font-black">{o.title}</p>
        <p className="text-white/70">{o.car ? tr("No drives here yet.") : tr("No rides here yet.")}</p>
      </div>,
    ];
  }
  const s: ReactNode[] = [];
  s.push(
    <div key="intro" className="space-y-3">
      <p className="text-xs uppercase tracking-[0.25em] text-white/60">{o.kicker}</p>
      <p className="text-5xl short:text-4xl font-black tracking-tight leading-none">{o.title}</p>
      <p className="text-lg text-white/80">
        {d.count === 1 ? (o.car ? tr("1 drive") : tr("1 ride")) : o.car ? tr("{0} drives", [d.count]) : tr("{0} rides", [d.count])}
      </p>
    </div>,
  );
  s.push(<Big key="dist" icon={RouteIcon} label={tr("Distance")} value={milesText(d.distance, o.unit)} sub={comparison(d)} />);
  s.push(
    <Big
      key="time"
      icon={Timer}
      label={o.car ? tr("Behind the wheel") : tr("In the saddle")}
      value={fmtHours(d.duration)}
      sub={d.daysRidden === 1 ? tr("On 1 day") : tr("Across {0} days", [d.daysRidden])}
    />,
  );
  if (d.longest) {
    s.push(
      <div key="longest" className="space-y-3">
        <Trophy className="w-10 h-10 text-accent-2" aria-hidden />
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">{o.car ? tr("Longest drive") : tr("Longest ride")}</p>
        <p className="text-5xl short:text-4xl font-black tracking-tight leading-none">{milesText(d.longest.distance, o.unit)}</p>
        <p className="text-base text-white/80">
          {d.longest.name ? `${d.longest.name} · ` : ''}
          {new Date(d.longest.startedAt).toLocaleDateString(o.lang, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <TrackSketch points={d.longest.gpsPoints} />
      </div>,
    );
  }
  if (d.towns.length) {
    s.push(
      <div key="towns" className="space-y-3">
        <MapPin className="w-10 h-10 text-accent-2" aria-hidden />
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">{tr("Where you rode")}</p>
        <p className="text-3xl font-black leading-tight">{d.towns.slice(0, 6).join(' · ')}</p>
        {d.towns.length > 6 && <p className="text-white/70">{tr("and {0} more", [d.towns.length - 6])}</p>}
      </div>,
    );
  }
  if (o.speed) {
    const top = o.peaksHidden || d.topSpeed == null ? PEAK_HIDDEN : speedText(d.topSpeed);
    const lean = o.lean ? (o.peaksHidden || d.maxLean == null ? PEAK_HIDDEN : `${Math.round(d.maxLean)}°`) : null;
    s.push(
      <div key="speed" className="space-y-3">
        <Gauge className="w-10 h-10 text-accent-2" aria-hidden />
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">{tr("Average speed")}</p>
        <p className="text-5xl short:text-4xl font-black tracking-tight leading-none">{speedText(d.averageSpeed)}</p>
        <p className="text-base text-white/80">{lean ? tr("Top speed {0} · max lean {1}", [top, lean]) : tr("Top speed {0}", [top])}</p>
      </div>,
    );
  }
  if (d.favouriteDay != null && d.timeOfDay) {
    // Monday is day 0 here; 2024-01-01 was a Monday.
    const day = new Date(2024, 0, 1 + d.favouriteDay).toLocaleDateString(o.lang, { weekday: 'long' });
    const tod =
      d.timeOfDay === 'morning'
        ? tr("A morning rider")
        : d.timeOfDay === 'afternoon'
          ? tr("An afternoon rider")
          : d.timeOfDay === 'evening'
            ? tr("An evening rider")
            : tr("A night rider");
    s.push(<Big key="rhythm" icon={CalendarDays} label={tr("Your rhythm")} value={tod} sub={tr("Your favourite day: {0}", [day])} />);
  }
  if ((o.badges && d.badges.length) || d.convoyRides) {
    s.push(
      <div key="badges" className="space-y-3">
        <Award className="w-10 h-10 text-accent-2" aria-hidden />
        {o.badges && d.badges.length > 0 && (
          <>
            <p className="text-xs uppercase tracking-[0.25em] text-white/60">{tr("Badges earned")}</p>
            <div className="flex flex-wrap gap-2">
              {d.badges.slice(0, 6).map((b) => {
                const Icon = BADGE_ICON[b.badge as BadgeType] ?? Award;
                return (
                  <span key={b.badge} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
                    <Icon className="w-4 h-4 text-accent-2" aria-hidden />
                    {BADGE_INFO[b.badge as BadgeType]?.label ?? b.badge}
                    {b.count > 1 && <span className="text-white/60">×{b.count}</span>}
                  </span>
                );
              })}
            </div>
          </>
        )}
        {d.convoyRides > 0 && (
          <p className="text-lg text-white/80 flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-2" aria-hidden />
            {d.convoyRides === 1 ? tr("1 convoy ride") : tr("{0} convoy rides", [d.convoyRides])}
          </p>
        )}
      </div>,
    );
  }
  s.push(<ShareSlide key="share" d={d} o={o} />);
  return s;
}

/** The longest ride's own track, drawn as a line (no map, nothing fetched). */
function TrackSketch({ points }: { points: Array<{ lat: number; lng: number }> | undefined }) {
  const path = useMemo(() => {
    if (!points || points.length < 2) return null;
    const step = Math.max(1, Math.floor(points.length / 300));
    const pts = points.filter((_, i) => i % step === 0);
    const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p.lng * k);
    const ys = pts.map((p) => -p.lat);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
    return pts.map((_, i) => `${i ? 'L' : 'M'}${(((xs[i] - minX) / span) * 90 + 5).toFixed(2)} ${(((ys[i] - minY) / span) * 90 + 5).toFixed(2)}`).join(' ');
  }, [points]);
  if (!path) return null;
  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-[16rem] aspect-square short:max-w-[10rem]" aria-hidden>
      <path d={path} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The last slide: the period on one card, shared as an image. */
function ShareSlide({ d, o }: { d: WrappedData; o: Opts }) {
  const card = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (!card.current || busy) return;
    setBusy(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(card.current, { pixelRatio: 3, cacheBust: true, backgroundColor: '#0b0b0c' });
      const name = `blacktop-wrapped-${d.key}.png`;
      const blob = await (await fetch(dataUrl)).blob();
      if (Capacitor.isNativePlatform()) {
        await shareFileNative(name, blob, tr("Blacktop Wrapped"));
      } else if (navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] })) {
        await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title: tr("Blacktop Wrapped") });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(tr("Image saved"));
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(tr("Couldn't make the image"));
    } finally {
      setBusy(false);
    }
  };
  const rows: Array<[string, string]> = [
    [o.car ? tr("Drives") : tr("Rides"), String(d.count)],
    [tr("Distance"), milesText(d.distance, o.unit)],
    [o.car ? tr("Behind the wheel") : tr("In the saddle"), fmtHours(d.duration)],
  ];
  if (d.longest) rows.push([o.car ? tr("Longest drive") : tr("Longest ride"), milesText(d.longest.distance, o.unit)]);
  if (o.speed) rows.push([tr("Top speed"), o.peaksHidden || d.topSpeed == null ? PEAK_HIDDEN : speedText(d.topSpeed)]);
  if (d.towns.length) rows.push([tr("Towns"), String(d.towns.length)]);
  return (
    <div className="space-y-4">
      <div ref={card} className="rounded-3xl border border-accent/60 bg-[#0b0b0c] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-semibold">{tr("Blacktop Wrapped")}</p>
          <Sparkles className="w-4 h-4 text-accent-2" aria-hidden />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">{o.kicker}</p>
          <p className="text-3xl font-black leading-tight">{o.title}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-widest text-white/50">{k}</dt>
              <dd className="text-xl font-bold font-mono">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10px] text-white/40">blacktoplive.com</p>
      </div>
      <button type="button" onClick={share} disabled={busy} className="w-full h-12 rounded-2xl bg-accent text-accent-foreground font-bold inline-flex items-center justify-center gap-2">
        <Share2 className="w-5 h-5" /> {tr("Share")}
      </button>
    </div>
  );
}
