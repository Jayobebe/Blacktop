import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useRideHistory } from '../hooks/useRideHistory';
import { finishedWraps, useWrappedSeen, type WrappedPeriod, type WrappedRange } from '../lib/wrapped';

/**
 * Stats' Wrapped row (lib/wrapped, pages/Wrapped): the week, month and year so
 * far and all time, a tile each, and above them any finished week, month or
 * year not opened yet ("Last week's Wrapped is ready"), glowing like the
 * Settings button for What's new.
 */
const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function WrappedPanel({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { rides } = useRideHistory();
  useWrappedSeen();
  const ready = finishedWraps(rides).filter((w) => w.isNew);
  const open = (period: WrappedPeriod, range?: WrappedRange) => navigate(range ? `/wrapped/${period}?at=${day(range.start)}` : `/wrapped/${period}`);
  const readyName = (r: WrappedRange) =>
    r.period === 'week' ? tr("Last week's Wrapped is ready") : r.period === 'month' ? tr("Last month's Wrapped is ready") : tr("Last year's Wrapped is ready");
  const tiles: Array<[WrappedPeriod, string]> = [
    ['week', tr("This week")],
    ['month', tr("This month")],
    ['year', tr("This year")],
    ['all', tr("All time")],
  ];
  return (
    <section data-tip="stats-wrapped" className={cn('space-y-2', className)} aria-label={tr("Wrapped")}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-accent-2" aria-hidden />
        {tr("Wrapped")}
      </p>
      {ready.map(({ range }) => (
        <button
          key={range.period}
          type="button"
          onClick={() => open(range.period, range)}
          className="news-glow w-full h-12 rounded-2xl border border-accent bg-accent/10 text-accent font-semibold text-sm inline-flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" aria-hidden />
          {readyName(range)}
        </button>
      ))}
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() => open(p)}
            className="h-14 rounded-2xl border border-border/40 bg-card/50 text-xs font-semibold px-1 leading-tight hover:bg-accent/10"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
