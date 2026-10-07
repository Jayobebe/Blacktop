import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Car, Bike } from 'lucide-react';
import { useSettings } from '@/features/settings';
import { useArcadeScores } from '../hooks/useArcadeScores';
import { syncExistingArcadeScores } from '../lib/publishArcadeScore';
import { tr } from '@/lib/i18n';
import { PageTips } from '@/features/guide';
// Not the Card Wars barrel: only its panel belongs on this page.
import { CardWarsArcadePanel } from '@/features/card-wars/light';

export function ArcadeLobby() {
  const navigate = useNavigate();
  const { scores } = useArcadeScores();
  const { settings } = useSettings();

  // Backfill any bests set before scores were syncing to the crew board.
  useEffect(() => { void syncExistingArcadeScores(); }, []);


  return (
    <section className="w-full h-full flex flex-col">
      {/* First-time tips: what each game is, and that playing here pays into Card Wars. */}
      <PageTips
        page="arcade"
        scroll
        tips={[
          { target: '[data-tip="arcade-hit"]', text: tr("Hold your phone tight in your fist and punch. Blacktop measures the hit in G.") },
          { target: '[data-tip="arcade-petrol"]', text: tr("Dodge traffic and grab fuel cans. Near misses charge a shield.") },
          { target: '[data-tip="arcade-cw"]', text: tr("Finishing a game here pays RPM for Card Wars. A personal best pays more.") },
        ]}
      />
      {/* Game tiles */}
      <div className="flex-1 grid grid-cols-2 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 pb-2">
        <button
          data-tip="arcade-hit"
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
          data-tip="arcade-petrol"
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
        {/* Card Wars has more to show than a best score: its panel takes the rest of the page. */}
        {settings.blacktopWorldEnabled && settings.collectiblesEnabled && <CardWarsArcadePanel onOpen={() => navigate('/arcade/card-wars')} />}
      </div>
    </section>
  );
}
