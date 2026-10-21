import { useEffect, useState } from 'react';
import { Clock, Timer, Play, Pause, Flag, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { isThermal } from '@/lib/thermal';
import { useStopwatch, elapsed, startStopwatch, stopStopwatch, lapStopwatch, resetStopwatch, stopwatchText } from '../lib/stopwatch';
import { SlidingPill } from '@/components/SlidingPill';

type Mode = 'clock' | 'stopwatch';
const MODE_KEY = 'blacktop_calendar_clock';

/**
 * The big live clock above the Blacktop Calendar, with buttons under it to
 * change what it shows: the time (and the date), or the stopwatch (start,
 * stop, lap, reset, the laps listed). More modes (alarms, reminders) go in the
 * same row. The stopwatch carries on away from the page (lib/stopwatch).
 */
export function CalendarClock() {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'stopwatch' ? 'stopwatch' : 'clock';
    } catch {
      return 'clock';
    }
  });
  const choose = (m: Mode) => {
    haptics.tick();
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* this launch only */
    }
  };
  const sw = useStopwatch();
  const [now, setNow] = useState(() => Date.now());
  // The clock ticks each second; a running stopwatch about thirty times a second (each second under Thermal mode).
  useEffect(() => {
    const fast = mode === 'stopwatch' && sw.runningSince && !isThermal();
    if (fast) {
      let raf = 0;
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 33) {
          last = t;
          setNow(Date.now());
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [mode, sw.runningSince]);

  const lang = document.documentElement.lang || undefined;
  const d = new Date(now);
  // The time in the phone's own way (12 or 24 hour), split so AM / PM can sit small beside it.
  const parts = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const hhmm = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  const period = parts.find((p) => p.type === 'dayPeriod')?.value;
  const total = elapsed(sw, now);

  return (
    <section className="mb-4" aria-label={mode === 'clock' ? tr("Clock") : tr("Stopwatch")}>
      <div className="text-center select-none">
        {mode === 'clock' ? (
          <>
            <p className="font-mono font-black tracking-tight leading-none whitespace-nowrap text-[clamp(3.5rem,19vw,6rem)] short:text-[clamp(2.5rem,11vh,4rem)]" aria-live="off">
              {hhmm}
              {/* The seconds small beside it, then AM / PM where the phone's clock has them. */}
              <span className="inline-flex flex-col items-start ml-1.5 align-top text-[0.3em] leading-[1.05]">
                <span className="text-muted-foreground">{String(d.getSeconds()).padStart(2, '0')}</span>
                {period && <span className="text-muted-foreground">{period}</span>}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </>
        ) : (
          <>
            <p className="font-mono font-black tracking-tight leading-none text-[clamp(3rem,16vw,5.5rem)] short:text-[clamp(2.25rem,10vh,3.5rem)]">{stopwatchText(total)}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptics.tick();
                  if (sw.runningSince) stopStopwatch();
                  else startStopwatch();
                }}
                className={cn('pressable h-12 min-w-[7rem] px-4 rounded-2xl font-semibold inline-flex items-center justify-center gap-1.5', sw.runningSince ? 'bg-[hsl(var(--burn))] text-white' : 'bg-accent text-accent-foreground')}
              >
                {sw.runningSince ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {sw.runningSince ? tr("Stop") : total ? tr("Carry on") : tr("Start")}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.tick();
                  if (sw.runningSince) lapStopwatch();
                  else resetStopwatch();
                }}
                disabled={!sw.runningSince && !total}
                className="pressable h-12 min-w-[7rem] px-4 rounded-2xl font-semibold inline-flex items-center justify-center gap-1.5 frost-accent bg-card/60 disabled:opacity-40"
              >
                {sw.runningSince ? <Flag className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                {sw.runningSince ? tr("Lap") : tr("Reset")}
              </button>
            </div>
            {sw.laps.length > 0 && (
              <ol className="mt-3 mx-auto max-w-xs max-h-32 overflow-y-auto text-sm font-mono">
                {sw.laps.map((t, i) => (
                  <li key={sw.laps.length - i} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground">{tr("Lap {0}", [sw.laps.length - i])}</span>
                    <span>{stopwatchText(t - (sw.laps[i + 1] ?? 0))}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      {/* What the clock shows. */}
      <div role="tablist" className="relative mt-3 mx-auto max-w-xs grid grid-cols-2 gap-1 rounded-xl border border-accent/40 bg-background/60 p-0.5">
        <SlidingPill />
        {(
          [
            ['clock', tr("Clock"), Clock],
            ['stopwatch', tr("Stopwatch"), Timer],
          ] as const
        ).map(([m, label, I]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => choose(m)}
            className={cn('tall-hit relative z-[1] flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors duration-300', mode === m ? 'text-accent-foreground' : 'text-accent/80')}
          >
            <I className="w-3.5 h-3.5" /> {label}
            {m === 'stopwatch' && sw.runningSince && mode !== 'stopwatch' && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--burn))] motion-safe:animate-pulse" />}
          </button>
        ))}
      </div>
    </section>
  );
}
