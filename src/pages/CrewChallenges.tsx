import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, Timer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRideHistory } from '@/features/ride';
import { analyseCorners } from '@/features/ride/lib/cornerScoring';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import { challengeForWeek, daysLeftInWeek, weekKey, weekStart } from '@/features/crew/challenges';
import { grantChallengeCopy } from '@/features/cards';
import { toast } from 'sonner';

interface ChallengeRow {
  display_name: string;
  distance: number;
  ride_count: number;
  max_lean: number;
  corner_score: number;
}

export default function CrewChallenges() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides } = useRideHistory();
  const { profile } = useProfile();

  const key = weekKey();
  const challenge = challengeForWeek(key);
  const daysLeft = daysLeftInWeek();

  // This rider's stats for the current week only.
  const mine = useMemo(() => {
    const from = weekStart().getTime();
    const week = rides.filter((r) => new Date(r.startedAt).getTime() >= from);
    const cornerScores = week
      .map((r) => analyseCorners(r).averageScore)
      .filter((s) => s > 0);
    return {
      distance: Number(week.reduce((s, r) => s + (r.distance || 0), 0).toFixed(2)),
      ride_count: week.length,
      max_lean: Math.round(Math.max(0, ...week.map((r) => Math.max(r.maxLeanLeft || 0, r.maxLeanRight || 0)))),
      corner_score: cornerScores.length
        ? Math.round(cornerScores.reduce((s, v) => s + v, 0) / cornerScores.length)
        : 0,
    };
  }, [rides]);

  // Publish own row for the crew board.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await supabase.from('crew_weekly_scores' as any).upsert({
        user_id: user.id,
        week_key: key,
        crew_code: crew.code,
        display_name: profile.name || 'Rider',
        distance: mine.distance,
        ride_count: mine.ride_count,
        max_lean: mine.max_lean,
        corner_score: mine.corner_score,
        updated_at: new Date().toISOString(),
      } as any);
    })();
    return () => { cancelled = true; };
  }, [crew.code, key, profile.name, mine]);

  const { data: rows = [] } = useQuery({
    queryKey: ['crew-challenge', crew.code, key],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('list_crew_challenge', {
        _crew_code: crew.code,
        _week_key: key,
      });
      return (data ?? []) as ChallengeRow[];
    },
    refetchInterval: 30000,
  });

  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b[challenge.metric] ?? 0) - Number(a[challenge.metric] ?? 0)),
    [rows, challenge.metric],
  );

  const myValue = mine[challenge.metric];
  const pct = Math.min(100, (myValue / challenge.target) * 100);

  // Hitting the weekly target earns a spare copy of your card to drop on the map.
  useEffect(() => {
    if (myValue < challenge.target) return;
    if (grantChallengeCopy(key)) {
      toast.success('Challenge complete', { description: 'Spare card copy earned — drop it on the map.' });
    }
  }, [myValue, challenge.target, key]);
  const fmt = (v: number) =>
    challenge.metric === 'distance' ? `${Number(v).toFixed(1)} ${challenge.unit}` : `${Math.round(Number(v))} ${challenge.unit}`;

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
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Crew Challenge</h1>
      </header>

      {/* Challenge banner */}
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 to-accent/5 p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Flag className="w-4 h-4 text-accent" />
              <h2 className="font-display font-bold text-lg leading-none">{challenge.title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{challenge.blurb}</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            <Timer className="w-3.5 h-3.5" />
            {daysLeft}d left
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">You</span>
            <span className="text-sm font-bold tabular-nums">{fmt(myValue)}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Crew {crew.code} · week {key}
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 py-10 text-center">
          No crew entries this week yet. Get out and ride.
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
                  {fmt(Number(row[challenge.metric] ?? 0))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
