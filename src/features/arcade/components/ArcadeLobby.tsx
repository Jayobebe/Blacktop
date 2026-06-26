import { useNavigate } from 'react-router-dom';
import { Zap, Car, Gamepad2 } from 'lucide-react';
import { useArcadeScores } from '../hooks/useArcadeScores';

export function ArcadeLobby() {
  const navigate = useNavigate();
  const { scores } = useArcadeScores();

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-3">
        <Gamepad2 className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-tight text-white">Blacktop Arcade</h2>
      </div>

      {/* Game tiles */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-8">
        <button
          onClick={() => navigate('/arcade/hit-heavy')}
          className="flex flex-col items-center gap-3 py-6 px-3 bg-card/50 border border-border/30 rounded-2xl
                     hover:bg-card/70 hover:border-accent/40 active:scale-[0.98] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold tracking-tight text-white leading-none">Hit Heavy</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">Punch machine</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {scores['hit-heavy'] > 0 ? `Best: ${scores['hit-heavy'].toFixed(2)}G` : 'No score yet'}
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/arcade/petrol-head')}
          className="flex flex-col items-center gap-3 py-6 px-3 bg-card/50 border border-border/30 rounded-2xl
                     hover:bg-card/70 hover:border-accent/40 active:scale-[0.98] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Car className="w-5 h-5 text-accent" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold tracking-tight text-white leading-none">Petrol Head</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {scores['petrol-head'] > 0 ? `Best: ${scores['petrol-head']}s` : 'No score yet'}
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
