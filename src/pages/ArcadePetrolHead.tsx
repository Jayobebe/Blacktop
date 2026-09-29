import { PageHeader } from '@/components/PageHeader';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { PetrolHead } from '@/features/arcade/components/games/PetrolHead';
import { tr } from '@/lib/i18n';

export default function ArcadePetrolHead() {
  const { settings } = useSettings();
  const accentHsl = ACCENT_COLORS.find(c => c.id === settings.accentColor)?.hsl ?? ACCENT_COLORS[0].hsl;
  const accentColor = `hsl(${accentHsl.trim().split(/\s+/).join(', ')})`;

  return (
    <div className="h-dvh flex flex-col px-4 pt-4 landscape:px-3 landscape:pt-3 safe-top overflow-hidden">
      <PageHeader title={tr("Petrol Head")} subtitle={tr("Traffic run")} className="!mb-3" />
      <div className="relative flex-1 min-h-0 -mx-4 landscape:-mx-3">
        <PetrolHead accentColor={accentColor} showSpeed={settings.speedFocusEnabled !== false} />
      </div>
    </div>
  );
}
