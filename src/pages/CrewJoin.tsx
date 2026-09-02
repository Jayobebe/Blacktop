import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { useCrew, joinCrew, leaveCrew } from '@/features/crew/useCrew';
import { toast } from 'sonner';

export default function CrewJoin() {
  const navigate = useNavigate();
  const crew = useCrew();
  const [code, setCode] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 3) {
      toast.error('Enter a crew code');
      return;
    }
    joinCrew(code);
    setCode('');
    toast.success('Crew joined');
  };

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
        <h1 className="text-lg font-bold tracking-[0.22em] uppercase">Join Crew</h1>
      </header>

      {crew.code ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5 text-center">
          <Users className="w-6 h-6 mx-auto mb-3 text-accent" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current crew</p>
          <p className="text-2xl font-bold mt-1">{crew.name}</p>
          <button
            type="button"
            onClick={() => { leaveCrew(); toast.success('Left crew'); }}
            className="mt-5 w-full py-3 rounded-xl border border-destructive/50 text-destructive text-sm font-semibold uppercase tracking-widest"
          >
            Leave crew
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a crew code shared by a friend. Your crew is stored on this device only.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CREW CODE"
            aria-label="Crew code"
            className="w-full px-4 py-3 rounded-xl bg-card/60 border border-border/40 uppercase tracking-[0.2em] text-center focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full py-3 rounded-xl border border-accent text-accent text-sm font-semibold uppercase tracking-widest hover:bg-accent/10 transition-colors"
          >
            Join
          </button>
        </form>
      )}
    </div>
  );
}
