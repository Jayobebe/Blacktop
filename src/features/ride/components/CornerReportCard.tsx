import { useMemo, useState } from 'react';
import { CornerUpRight, ChevronDown } from 'lucide-react';
import { analyseCorners } from '../lib/cornerScoring';
import type { RideSession } from '@/types/blacktop';
import { cn } from '@/lib/utils';

interface Props {
  ride: RideSession;
}

function toneFor(score: number) {
  if (score >= 80) return 'text-accent';
  if (score >= 60) return 'text-foreground';
  if (score >= 45) return 'text-warning';
  return 'text-destructive';
}

export function CornerReportCard({ ride }: Props) {
  const report = useMemo(() => analyseCorners(ride), [ride]);
  const [expanded, setExpanded] = useState(false);

  if (!report.count) return null;

  const shown = expanded ? report.corners : [...report.corners].sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <div className="bg-card rounded-xl border border-border mb-3 animate-slide-up overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
            <CornerUpRight className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Corner Report</h3>
            <p className="text-xs text-muted-foreground">
              {report.count} corners · {report.cornersPerMile}/mi · {report.totalArc}° turned
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn('text-2xl font-display font-bold leading-none', toneFor(report.averageScore))}>
            {report.grade}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{report.averageScore}/100</p>
        </div>
      </div>

      <ul className="px-3 pb-2 space-y-1.5">
        {shown.map((c) => (
          <li
            key={c.index}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border/30"
          >
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-10">
              {c.direction === 'left' ? 'Left' : 'Right'}
            </span>
            <span className="flex-1 text-xs text-muted-foreground truncate">
              {c.arc}° · {c.apexSpeed} mph apex{c.maxLean ? ` · ${c.maxLean}° lean` : ''}
            </span>
            <span className={cn('text-sm font-bold tabular-nums', toneFor(c.score))}>{c.score}</span>
          </li>
        ))}
      </ul>

      {report.count > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground border-t border-border/40"
        >
          {expanded ? 'Show best 3' : `All ${report.count} corners`}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
