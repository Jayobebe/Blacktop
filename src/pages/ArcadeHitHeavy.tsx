import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { HitHeavy } from '@/features/arcade/components/games/HitHeavy';

export default function ArcadeHitHeavy() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const accentHsl = ACCENT_COLORS.find(c => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  return (
    <div className="min-h-screen bg-background flex flex-col safe-top safe-bottom">
      <header className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-3.5 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight text-white">Hit Heavy</h1>
      </header>

      <div className="flex-1 flex flex-col">
        <HitHeavy accentColor={accentColor} />
      </div>
    </div>
  );
}
