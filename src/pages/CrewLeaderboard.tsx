import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useRideHistory } from '@/features/ride';
import { useArcadeScores } from '@/features/arcade';
import { useCrew } from '@/features/crew/useCrew';

export default function CrewLeaderboard() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides } = useRideHistory();
  const scores = useArcadeScores();

  const stats = useMemo(() => {
    const distance = rides.reduce((s, r) => s + (r.distance || 0), 0);
    const topSpeed = rides.reduce((s, r) => Math.max(s, r.maxSpeed || 0), 0);
    const lean = rides.reduce((s, r) => Math.max(s, r.maxLeanLeft || 0, r.maxLeanRight || 0), 0);
    return { distance, topSpeed, lean, rides: rides.length };
  }, [rides]);

  const rows: { label: string; value: string }[] = [
    { label: 'Rides logged', value: String(stats.rides) },
    { label: 'Total distance', value: `${stats.distance.toFixed(1)} mi` },
    { label: 'Top speed', value: `${Math.round(stats.topSpeed)} mph` },
    { label: 'Deepest lean', value: `${Math.round(stats.lean)}°` },
    { label: 'Hit Heavy', value: String(scores['hit-heavy'] ?? 0) },
    { label: 'Petrol Head', value: String(scores['petrol-head'] ?? 0) },
  ];

  return (
    <div className="min-h-dvh bg-background safe-top safe-bottom px-4 pt-4 pb-8">
      <header className="relative flex items-center justify-center pb-6">
        <button
          type="button"
          onClick={() => navigate('/world')}
          className="absolute left-0 top-0 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back to Blacktop World"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Crew Leaderboard</h1>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-accent" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {crew.code ? `${crew.name} — your standings` : 'Your standings'}
        </p>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-card/40 border border-border/30"
          >
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-sm font-bold tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>

      {!crew.code && (
        <button
          type="button"
          onClick={() => navigate('/crew/join')}
          className="mt-6 w-full py-3 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors"
        >
          Join a crew to compare
        </button>
      )}
    </div>
  );
}
