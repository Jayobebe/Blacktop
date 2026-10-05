import { useEffect, useState } from 'react';
import { ArrowLeft, Megaphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { HAZARD_CATEGORIES, HAZARD_TYPES, type HazardCategoryId, type HazardKind } from '../types';
import { HazardError, removeMyHazard, reportHazard } from '../lib/hazardStore';
import { getLastHazardPosition } from '../lib/position';
import { tr } from '@/lib/i18n';

export interface ReportPosition {
  lat: number;
  lng: number;
  heading: number | null;
}

/**
 * The Report button and its picker: tap a category, then the hazard. Reports
 * where the rider is right now, with an Undo for a mis-tap. Big targets
 * throughout, for gloves.
 */
export function HazardReport({ getPosition, className }: { getPosition?: () => ReportPosition | null; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          haptics.light();
          setOpen(true);
        }}
        className={cn(
          'pointer-events-auto flex items-center gap-1.5 h-12 pl-3.5 pr-4 rounded-full frost-accent shadow-lg text-sm font-semibold active:scale-95 transition-transform',
          className,
        )}
        aria-label={tr("Report a hazard")}
      >
        <Megaphone className="w-4 h-4" />{" "}{tr("Report")}
      </button>
      {open && <HazardPicker onClose={() => setOpen(false)} getPosition={getPosition} />}
    </>
  );
}

function HazardPicker({ onClose, getPosition }: { onClose: () => void; getPosition?: () => ReportPosition | null }) {
  const [category, setCategory] = useState<HazardCategoryId | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const report = async (kind: HazardKind) => {
    const pos = getPosition?.() ?? getLastHazardPosition();
    if (!pos) {
      toast.error(tr("No GPS fix yet"), { description: tr("Reports go where you are. Try again in a moment.") });
      return;
    }
    setBusy(true);
    haptics.medium();
    const type = HAZARD_TYPES.find((t) => t.kind === kind)!;
    try {
      const id = await reportHazard(kind, pos, pos.heading);
      onClose();
      toast.success(tr("{0} reported", [type.label]), {
        description: tr("Riders coming this way will be warned."),
        duration: 6000,
        action: { label: tr("Undo"), onClick: () => void removeMyHazard(id).catch(() => toast.error(tr("Couldn't undo that"))) },
      });
    } catch (e) {
      const reason = e instanceof HazardError ? e.reason : 'failed';
      toast.error(
        reason === 'rate-limited' ? tr("That's a lot of reports") : reason === 'signed-out' ? tr("Sign in to report") : tr("Couldn't send the report"),
        { description: reason === 'rate-limited' ? tr("Try again in a little while.") : tr("Check your connection and try again.") },
      );
    } finally {
      setBusy(false);
    }
  };

  const cat = category ? HAZARD_CATEGORIES.find((c) => c.id === category)! : null;
  const types = category ? HAZARD_TYPES.filter((t) => t.category === category) : [];

  return (
    <div className="fixed inset-0 z-[1250] bg-background/80 backdrop-blur-sm safe-frame-x flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+var(--safe-top))] pb-[calc(0.75rem+var(--safe-bottom))] animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-label={tr("Report a hazard")}
        className="w-full max-w-md short:max-w-2xl max-h-full overflow-y-auto rounded-3xl border border-border bg-card/95 shadow-2xl p-3 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-1 pb-3">
          {cat ? (
            <button onClick={() => setCategory(null)} className="glove-hit p-2 -ml-1 rounded-xl hover:bg-muted" aria-label={tr("Back to categories")}>
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <Megaphone className="w-5 h-5 text-accent ml-1" />
          )}
          <p className="flex-1 font-bold">{cat ? cat.label : tr("Report a hazard")}</p>
          <button onClick={onClose} className="glove-hit p-2 rounded-xl hover:bg-muted" aria-label={tr("Close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {!cat ? (
          <div className="grid grid-cols-2 short:grid-cols-4 gap-2">
            {HAZARD_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  haptics.light();
                  setCategory(c.id);
                }}
                className="h-28 short:h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 font-semibold active:scale-95 transition-transform"
                style={{ borderColor: `${c.color}99`, background: `${c.color}1f` }}
              >
                <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: c.color }}>
                  <c.icon className="w-6 h-6 text-white" strokeWidth={2.4} />
                </span>
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className={cn('grid gap-2', types.length > 4 ? 'grid-cols-2 short:grid-cols-5' : 'grid-cols-2 short:grid-cols-4')}>
            {types.map((t) => (
              <button
                key={t.kind}
                disabled={busy}
                onClick={() => void report(t.kind)}
                className="min-h-[6.5rem] short:min-h-[5.5rem] rounded-2xl border-2 flex flex-col items-center justify-center gap-2 px-2 text-sm font-semibold text-center leading-tight active:scale-95 transition-transform disabled:opacity-60"
                style={{ borderColor: `${cat.color}99`, background: `${cat.color}14` }}
              >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: cat.color }}>
                  <t.icon className="w-5 h-5 text-white" strokeWidth={2.4} />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">{tr("Reports are anonymous and placed where you are now.")}</p>
      </div>
    </div>
  );
}
