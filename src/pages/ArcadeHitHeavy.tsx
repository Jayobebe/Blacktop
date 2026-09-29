import { PageHeader } from '@/components/PageHeader';
import { HitHeavy } from '@/features/arcade/components/games/HitHeavy';
import { tr } from '@/lib/i18n';

export default function ArcadeHitHeavy() {
  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      <PageHeader title={tr("Hit Heavy")} subtitle={tr("Punch machine")} />
      <HitHeavy />
    </div>
  );
}
