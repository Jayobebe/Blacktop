import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ListSkeleton } from '@/components/skeletons';
import { supabase } from '@/integrations/supabase/client';
import { nudgePush } from '@/features/notifications';
import { useRideHistory } from '@/features/ride';
import { crewTotals, publishCrewTotals } from '@/features/crew/stats';
import { useArcadeScores } from '@/features/arcade';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import { PageHeader, HeaderButton } from '@/components/PageHeader';

interface CrewRow {
  display_name: string;
  total_distance: number;
  top_speed: number;
  max_lean: number;
  ride_count: number;
  hit_heavy: number;
  petrol_head: number;
}

const METRICS: { id: keyof CrewRow; label: string; format: (v: number) => string }[] = [
  { id: 'total_distance', label: 'Distance', format: (v) => `${v.toFixed(1)} mi` },
  { id: 'top_speed', label: 'Top speed', format: (v) => `${Math.round(v)} mph` },
  { id: 'max_lean', label: 'Lean', format: (v) => `${Math.round(v)}°` },
  { id: 'ride_count', label: 'Rides', format: (v) => String(Math.round(v)) },
  { id: 'hit_heavy', label: 'Hit Heavy', format: (v) => `${Number(v).toFixed(2)}G` },
  { id: 'petrol_head', label: 'Petrol Head', format: (v) => String(Math.round(v)) },
];

export default function CrewLeaderboard() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides, burnedTotals } = useRideHistory();
  const { scores } = useArcadeScores();
  const { profile } = useProfile();
  const [metric, setMetric] = useState<keyof CrewRow>('total_distance');

  const mine = useMemo(() => crewTotals(rides, burnedTotals, scores), [rides, burnedTotals, scores]);

  // Publish this rider's own aggregate stats to the crew board (own row only).
  useEffect(() => {
    void publishCrewTotals(crew.code, profile.name, mine).then((ok) => ok && nudgePush());
  }, [crew.code, profile.name, mine]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['crew-leaderboard', crew.code],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('list_crew_leaderboard', { _crew_code: crew.code });
      return (data ?? []) as CrewRow[];
    },
    refetchInterval: 30000,
  });

  const active = METRICS.find((m) => m.id === metric)!;
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b[metric] ?? 0) - Number(a[metric] ?? 0)),
    [rows, metric],
  );

  return (
    <div className="min-h-dvh safe-top safe-bottom px-4 pt-4 pb-8">
      <PageHeader title="Crew Leaderboards" backTo="/world" backLabel="Back to Blacktop World" />

      {/* This page publishes the rider's own totals (see the effect above), so say so. */}
      <p className="text-[11px] text-muted-foreground mb-3">
        Your totals (distance, top speed, max lean, rides and arcade scores) are shared with your crew while you're in it.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-accent" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Crew {crew.code}
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
          No crew stats yet. Ride, then check back.
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
                <span className="w-6 text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-sm truncate">{row.display_name}</span>
                <span className="text-sm font-bold tabular-nums">
                  {active.format(Number(row[metric] ?? 0))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
