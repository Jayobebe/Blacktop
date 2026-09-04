import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ArcadeLobby } from '@/features/arcade';

export default function Arcade() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom overflow-y-auto">
      <header className="flex items-center gap-4 mb-4 landscape:mb-3 flex-shrink-0 animate-fade-in">
        <button
          onClick={() => navigate('/world')}
          className="p-2.5 landscape:p-2 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <div>
          <h1 className="text-2xl landscape:text-xl font-semibold tracking-tight">Blacktop Arcade</h1>
          <p className="text-xs text-muted-foreground">Games & personal bests</p>
        </div>
      </header>

      <div className="flex-1 animate-slide-up delay-100">
        <ArcadeLobby />
      </div>
    </div>
  );
}
