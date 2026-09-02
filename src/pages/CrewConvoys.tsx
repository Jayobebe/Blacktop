import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, Plus, QrCode } from 'lucide-react';
import { useRideHistory } from '@/features/ride';
import { useCrew } from '@/features/crew/useCrew';

export default function CrewConvoys() {
  const navigate = useNavigate();
  const crew = useCrew();
  const { rides } = useRideHistory();
  const convoyRides = rides.filter((r) => r.isConvoyRide).slice(0, 10);

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
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Crew Convoys</h1>
      </header>

      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        {crew.code ? crew.name : 'No crew joined'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/create-convoy')}
          className="flex flex-col items-center gap-2 py-4 rounded-xl border border-accent/60 text-accent hover:bg-accent/10 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Start convoy</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/join-convoy')}
          className="flex flex-col items-center gap-2 py-4 rounded-xl border border-border/40 bg-card/40 hover:bg-secondary transition-colors"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">Join convoy</span>
        </button>
      </div>

      <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Recent crew rides</h2>
      {convoyRides.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 py-8 text-center">
          No convoy rides logged yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {convoyRides.map((ride) => (
            <li key={ride.id}>
              <button
                type="button"
                onClick={() => navigate(`/ride/${ride.id}`)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card/40 border border-border/30 hover:bg-secondary transition-colors text-left"
              >
                <span className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-accent" />
                  <span className="text-sm">
                    {ride.name || new Date(ride.startedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums">{ride.distance.toFixed(1)} mi</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
