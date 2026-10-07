import { PageHeader } from '@/components/PageHeader';
import { ArcadeLobby } from '@/features/arcade';
import { tr } from '@/lib/i18n';

export default function Arcade() {
  return (
    <div className="min-h-dvh flex flex-col p-4 landscape:p-3 safe-top safe-bottom overflow-y-auto">
      <PageHeader title={tr("Blacktop Arcade")} subtitle={tr("Games & personal bests")} backTo="/world" />

      <div className="flex-1 flex flex-col animate-slide-up delay-100">
        <ArcadeLobby />
      </div>
    </div>
  );
}
