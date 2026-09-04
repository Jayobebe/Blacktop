import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, Sparkles, Timer, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRideHistory } from '@/features/ride';
import { analyseCorners } from '@/features/ride/lib/cornerScoring';
import { useProfile } from '@/features/profile';
import { useCrew } from '@/features/crew/useCrew';
import {
  Challenge,
  challengesForWeek,
  daysLeftInMonth,
  daysLeftInWeek,
  monthKey,
  monthlyGoalFor,
  specialForWeek,
  weekKey,
  weekStart,
} from '@/features/crew/challenges';
import { grantChallengeCopy } from '@/features/cards';
import { toast } from 'sonner';

interface ChallengeRow {
  display_name: string;
  distance: number;
  ride_count: number;
  max_lean: number;
  corner_score: number;
  top_speed: number;
  night_rides: number;
  longest_ride: number;
}

type WeekStats = {
  distance: number;
  ride_count: number;
  max_lean: number;
  corner_score: number;
  top_speed: number;
  night_rides: number;
  longest_ride: number;
};

function isNightRide(startedAt: string | number | Date): boolean {
  const h = new Date(startedAt).getHours();
  return h >= 20 || h < 5;
}

function ChallengeCard({
  challenge,
  rows,
  myValue,
  myName,
}: {
  challenge: Challenge;
  rows: ChallengeRow[];
  myValue: number;
  myName: string;
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b[challenge.metric] ?? 0) - Number(a[challenge.metric] ?? 0)),
    [rows, challenge.metric],
  );
  const pct = Math.min(100, (myValue / challenge.target) * 100);
  const fmt = (v: number) =>
    challenge.metric === 'distance' || challenge.metric === 'longest_ride'
      ? `${Number(v).toFixed(1)} ${challenge.unit}`
      : `${Math.round(Number(v))} ${challenge.unit}`;

  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Flag className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold leading-none">{challenge.title}</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{challenge.blurb}</p>

      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">You</span>
        <span className="text-sm font-bold tabular-nums">{fmt(myValue)}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden mb-3">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      {sorted.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70 text-center py-2">No crew entries yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.slice(0, 5).map((row, i) => {
            const isMe = row.display_name === myName;
            return (
              <li
                key={`${row.display_name}-${i}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  isMe ? 'border-accent/60 bg-accent/5' : 'border-border/30 bg-card/40'
                }`}
              >
                <span className="w-4 font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate">{row.display_name}</span>
                <span className="font-bold tabular-nums">{fmt(Number(row[challenge.metric] ?? 0))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CrewChallenges() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides } = useRideHistory();
  const { profile } = useProfile();

  const key = weekKey();
  const mKey = monthKey();
  const [challengeA, challengeB] = challengesForWeek(key);
  const special = specialForWeek(key);
  const goal = monthlyGoalFor(mKey);
  const daysLeft = daysLeftInWeek();
  const monthDaysLeft = daysLeftInMonth();
  const myName = profile.name || 'Rider';

  // This rider's stats for the current week only.
  const mine: WeekStats = useMemo(() => {
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
      top_speed: Math.round(Math.max(0, ...week.map((r) => r.maxSpeed || 0))),
      night_rides: week.filter((r) => isNightRide(r.startedAt)).length,
      longest_ride: Number(Math.max(0, ...week.map((r) => r.distance || 0)).toFixed(2)),
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
        display_name: myName,
        distance: mine.distance,
        ride_count: mine.ride_count,
        max_lean: mine.max_lean,
        corner_score: mine.corner_score,
        top_speed: mine.top_speed,
        night_rides: mine.night_rides,
        longest_ride: mine.longest_ride,
        updated_at: new Date().toISOString(),
      } as any);
    })();
    return () => { cancelled = true; };
  }, [crew.code, key, myName, mine]);

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

  // Monthly crew goal — combined totals across the crew for the month.
  const { data: monthTotals } = useQuery({
    queryKey: ['crew-month', crew.code, mKey],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('list_crew_month', {
        _crew_code: crew.code,
        _month_key: mKey,
      });
      return (data?.[0] ?? null) as { distance: number; ride_count: number; members: number } | null;
    },
    refetchInterval: 30000,
  });

  const monthValue = Number(monthTotals?.[goal.metric] ?? 0);
  const monthPct = Math.min(100, (monthValue / goal.target) * 100);

  // Hitting a weekly target earns a spare copy of your card to drop on the map.
  useEffect(() => {
    for (const c of [challengeA, challengeB]) {
      if (mine[c.metric] < c.target) continue;
      const result = grantChallengeCopy(`${key}:${c.id}`);
      if (result === 'granted') {
        toast.success(`${c.title} complete`, { description: 'Spare card copy earned — drop it on the map.' });
      } else if (result === 'capped') {
        toast(`${c.title} complete`, { description: 'Copy bank full — 9/month max. Resets on the 1st. Earn all 9 for a 10th bonus copy.' });
      }
    }
  }, [mine, challengeA, challengeB, key]);

  // Crew hits the monthly goal → everyone participating earns a copy.
  useEffect(() => {
    if (!monthTotals || monthTotals.members === 0) return;
    if (monthValue < goal.target) return;
    const result = grantChallengeCopy(`${mKey}:${goal.id}`);
    if (result === 'granted') {
      toast.success(`${goal.title} smashed`, { description: 'Crew goal hit — spare card copy earned.' });
    } else if (result === 'capped') {
      toast(`${goal.title} smashed`, { description: 'Copy bank full — 9/month max. Resets on the 1st. Earn all 9 for a 10th bonus copy.' });
    }
  }, [monthTotals, monthValue, goal, mKey]);

  const goalFmt = (v: number) =>
    goal.metric === 'distance' ? `${Number(v).toFixed(0)} ${goal.unit}` : `${Math.round(Number(v))} ${goal.unit}`;

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

      {/* Monthly crew goal (Forzathon-style) */}
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 to-accent/5 p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-accent" />
              <h2 className="font-display font-bold text-lg leading-none">{goal.title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{goal.blurb}</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            <Timer className="w-3.5 h-3.5" />
            {monthDaysLeft}d left
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Crew {crew.code} · {monthTotals?.members ?? 0} riding
            </span>
            <span className="text-sm font-bold tabular-nums">
              {goalFmt(monthValue)} / {goalFmt(goal.target)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${monthPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Monthly crew goal — hit it together and everyone earns a spare card copy.
          </p>
        </div>
      </div>

      {/* This week's pair of challenges */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em]">This week</h2>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Timer className="w-3.5 h-3.5" />
          {daysLeft}d left
        </span>
      </div>

      {special && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <div className="min-w-0">
            <p className="text-xs font-bold leading-tight">{special.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{special.blurb}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <ChallengeCard challenge={challengeA} rows={rows} myValue={mine[challengeA.metric]} myName={myName} />
        <ChallengeCard challenge={challengeB} rows={rows} myValue={mine[challengeB.metric]} myName={myName} />
      </div>

      <p className="text-[10px] text-muted-foreground/60 text-center mt-4">
        Crew {crew.code} · week {key}
      </p>
    </div>
  );
}
