import { useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ReleaseLines } from '@/components/WhatsNew';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { markWhatsNewOpened, releaseDate, releases } from '@/lib/whatsNew';

/** Every release, newest first (Settings, under Burn). Opening it stops the glow on Settings. */
export default function WhatsNewPage() {
  useEffect(() => markWhatsNewOpened(), []);
  const list = releases();
  return (
    <div className="min-h-dvh px-4 pt-4 pb-10 safe-top safe-bottom md:px-5">
      <PageHeader title={tr("What's new")} subtitle={tr("Every update, newest first")} backTo="/settings" />
      <div className="space-y-3 max-w-xl mx-auto">
        {list.map((r, i) => (
          <section key={r.id} className={cn('rounded-2xl frost border p-4', i === 0 ? 'border-accent/50' : 'border-border/60')}>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold">{releaseDate(r.id)}</h2>
              {i === 0 && <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">{tr("Latest")}</span>}
            </div>
            <ReleaseLines release={r} />
          </section>
        ))}
      </div>
    </div>
  );
}
