import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Car, Gamepad2, Bike, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/features/settings';
import { useArcadeScores } from '../hooks/useArcadeScores';
import { syncExistingArcadeScores } from '../lib/publishArcadeScore';
import { tr } from '@/lib/i18n';

export function ArcadeLobby() {
  const navigate = useNavigate();
  const { scores } = useArcadeScores();
  const { settings } = useSettings();

  // Backfill any bests set before scores were syncing to the crew board.
  useEffect(() => { void syncExistingArcadeScores(); }, []);


  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-3">
        <Gamepad2 className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-tight text-white">{tr("Blacktop Arcade")}</h2>
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
            <div className="text-sm font-semibold tracking-tight text-white leading-none">{tr("Hit Heavy")}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{tr("Punch machine")}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {scores['hit-heavy'] > 0 ? tr("Best: {0}G", [scores['hit-heavy'].toFixed(2)]) : tr("No score yet")}
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
            <div className="text-sm font-semibold tracking-tight text-white leading-none">{tr("Petrol Head")}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {scores['petrol-head'] > 0 ? tr("Best: {0}s", [scores['petrol-head']]) : tr("No score yet")}
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/arcade/derez-legacy')}
          className="col-span-2 flex items-center gap-3 py-5 px-4 bg-card/50 border border-border/30 rounded-2xl
                     hover:bg-card/70 hover:border-accent/40 active:scale-[0.98] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Bike className="w-5 h-5 text-accent" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-sm font-semibold tracking-tight text-white leading-none">{tr("Derez Legacy")}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{tr("Real-world lightcycles · 2-8 riders")}</div>
          </div>
          <div className="text-[10px] text-muted-foreground text-right">
            {scores['legacy-derez'] > 0 ? tr("Wins: {0}", [scores['legacy-derez']]) : tr("No wins yet")}
          </div>
        </button>
        {settings.blacktopWorldEnabled && settings.collectiblesEnabled && (
          <Button
            variant="outline"
            onClick={() => navigate('/arcade/card-wars')}
            className="col-span-2 h-auto justify-start gap-3 py-5 px-4 bg-card/50 border-border/30 rounded-lg hover:bg-card/70 hover:border-accent/40"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Swords className="w-5 h-5 text-accent" />
            </div>
            <span className="text-sm font-semibold text-foreground">{tr('Card Wars')}</span>
          </Button>
        )}
      </div>
    </section>
  );
}
