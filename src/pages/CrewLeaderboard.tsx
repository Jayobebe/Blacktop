import { useSettings } from '@/features/settings';
import { challengeScore, type CrewUnits } from '@/features/crew/challenges';
import { useDemoMode } from '@/lib/demoMode';
import { demoLeaderboard } from '@/features/crew/demo';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ListSkeleton } from '@/components/skeletons';
import { supabase } from '@/integrations/supabase/client';
import { nudgePush } from '@/features/notifications';
import { PEAK_HIDDEN, useRideHistory } from '@/features/ride';
import { crewTotals, publishCrewTotals } from '@/features/crew/stats';
import { useArcadeScores } from '@/features/arcade';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';

interface CrewRow {
  display_name: string;
  total_distance: number;
  /** null: that rider keeps peaks private (Public Road Privacy). Shown as "--", ranked last. */
  top_speed: number | null;
  max_lean: number | null;
  ride_count: number;
  hit_heavy: number;
  petrol_head: number;
}

// Boards store miles and mph; shown in the rider's units.
const METRICS: { id: keyof CrewRow; label: string; format: (v: number, u: CrewUnits) => string }[] = [
  { id: 'total_distance', label: tr("Distance"), format: (v, u) => challengeScore('distance', v, u) },
  { id: 'top_speed', label: tr("Top speed"), format: (v, u) => challengeScore('top_speed', v, u) },
  { id: 'max_lean', label: tr("Lean"), format: (v) => `${Math.round(v)}°` },
  { id: 'ride_count', label: tr("Rides"), format: (v) => String(Math.round(v)) },
  { id: 'hit_heavy', label: tr("Hit Heavy"), format: (v) => `${Number(v).toFixed(2)}G` },
  { id: 'petrol_head', label: tr("Petrol Head"), format: (v) => String(Math.round(v)) },
];

export default function CrewLeaderboard() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides, burnedTotals } = useRideHistory();
  const { scores } = useArcadeScores();
  const { profile } = useProfile();
  const [metric, setMetric] = useState<keyof CrewRow>('total_distance');
  const { settings } = useSettings();
  const units: CrewUnits = { distance: settings.distanceUnit, speed: settings.speedUnit };

  const mine = useMemo(() => crewTotals(rides, burnedTotals, scores), [rides, burnedTotals, scores]);

  // Publish this rider's own aggregate stats to the crew board (own row only).
  useEffect(() => {
    void publishCrewTotals(crew.code, profile.name, mine).then((ok) => ok && nudgePush());
  }, [crew.code, profile.name, mine]);

  const { enabled: demo } = useDemoMode();
  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['crew-leaderboard', crew.code, demo],
    queryFn: async () => {
      if (demo) return demoLeaderboard(crew.code) as CrewRow[];
      const { data } = await (supabase as any).rpc('list_crew_leaderboard', { _crew_code: crew.code });
      return (data ?? []) as CrewRow[];
    },
    refetchInterval: 30000,
  });

  // Demo mode: the demo rider's row is their own (demo) rides, so it matches what they see elsewhere.
  const rows = useMemo(
    () => (demo ? fetched.map((r) => (r.display_name === (profile.name || 'Rider') ? { ...r, ...mine } : r)) : fetched),
    [demo, fetched, mine, profile.name],
  );

  const active = METRICS.find((m) => m.id === metric)!;
  // Private peaks (null) go last, unranked.
  const hidden = (row: CrewRow) => row[metric] == null;
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(hidden(a)) - Number(hidden(b)) || Number(b[metric] ?? 0) - Number(a[metric] ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, metric],
  );

  return (
    <div className="min-h-dvh safe-top safe-bottom px-4 pt-4 pb-8">
      <PageHeader title={tr("Crew Leaderboards")} backTo="/world" backLabel={tr("Back to Blacktop World")} />

      {/* This page publishes the rider's own totals (see the effect above), so say so. */}
      <p className="text-[11px] text-muted-foreground mb-3">
        {tr("Your totals (distance, top speed, max lean, rides and arcade scores) are shared with your crew while you're in it.")}
      </p>

      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-accent" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {crew.name}
        </p>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
        {METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetric(m.id)}
            className={`px-3 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap border transition-colors snap-start ${
              metric === m.id
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border/40 text-muted-foreground bg-card/40'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 py-10 text-center">
          {tr("No crew stats yet. Ride, then check back.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((row, i) => {
            const isMe = row.display_name === (profile.name || 'Rider');
            return (
              <li
                key={`${row.display_name}-${i}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  isMe ? 'border-accent/60 bg-accent/5' : 'border-border/30 bg-card/40'
                }`}
              >
                <span className="w-6 text-sm font-bold tabular-nums text-muted-foreground">{hidden(row) ? '' : i + 1}</span>
                <span className="flex-1 text-sm truncate">{row.display_name}</span>
                <span className="text-sm font-bold tabular-nums">
                  {hidden(row) ? PEAK_HIDDEN : active.format(Number(row[metric]), units)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
