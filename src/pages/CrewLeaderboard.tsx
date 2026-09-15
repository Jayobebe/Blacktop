import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRideHistory } from '@/features/ride';
import { useArcadeScores } from '@/features/arcade';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';

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
  { id: 'hit_heavy', label: 'Hit Heavy', format: (v) => String(Math.round(v)) },
  { id: 'petrol_head', label: 'Petrol Head', format: (v) => String(Math.round(v)) },
];

export default function CrewLeaderboard() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides } = useRideHistory();
  const { scores } = useArcadeScores();
  const { profile } = useProfile();
  const [metric, setMetric] = useState<keyof CrewRow>('total_distance');

  const mine = useMemo(() => ({
    total_distance: rides.reduce((s, r) => s + (r.distance || 0), 0),
    top_speed: rides.reduce((s, r) => Math.max(s, r.maxSpeed || 0), 0),
    max_lean: rides.reduce((s, r) => Math.max(s, r.maxLeanLeft || 0, r.maxLeanRight || 0), 0),
    ride_count: rides.length,
    hit_heavy: scores['hit-heavy'] ?? 0,
    petrol_head: scores['petrol-head'] ?? 0,
  }), [rides, scores]);

  // Publish this rider's own aggregate stats to the crew board (own row only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await supabase.from('crew_scores' as any).upsert({
        user_id: user.id,
        crew_code: crew.code,
        display_name: profile.name || 'Rider',
        total_distance: mine.total_distance,
        top_speed: mine.top_speed,
        max_lean: mine.max_lean,
        ride_count: mine.ride_count,
        hit_heavy: mine.hit_heavy,
        petrol_head: mine.petrol_head,
        updated_at: new Date().toISOString(),
      } as any);
    })();
    return () => { cancelled = true; };
  }, [crew.code, profile.name, mine]);

  const { data: rows = [] } = useQuery({
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
    <div className="min-h-dvh bg-background safe-top safe-bottom px-4 pt-4 pb-8">
      <header className="relative flex items-center justify-center pb-5">
        <button
          type="button"
          onClick={() => navigate('/world')}
          className="absolute left-0 top-0 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back to Blacktop World"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Crew Leaderboards</h1>
      </header>

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

      {sorted.length === 0 ? (
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
