import { ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CATEGORY_BY_ID, HAZARD_BY_KIND, hazardColor, type Hazard } from '../types';
import { HazardError, removeMyHazard, voteHazard } from '../lib/hazardStore';
import { tr } from '@/lib/i18n';

function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (m < 1) return tr("just now");
  if (m < 60) return tr("{0} min ago", [m]);
  const h = Math.round(m / 60);
  return h < 48 ? tr("{0} h ago", [h]) : tr("{0} days ago", [Math.round(h / 24)]);
}

/** A tapped hazard pin: what it is, how fresh, and still there / gone (or remove, if it's yours). */
export function HazardCard({ hazard, onClose, className }: { hazard: Hazard; onClose: () => void; className?: string }) {
  const type = HAZARD_BY_KIND[hazard.kind];
  const color = hazardColor(hazard.kind);
  const vote = async (stillThere: boolean) => {
    try {
      await voteHazard(hazard.id, stillThere);
      toast(stillThere ? tr("Thanks, confirmed") : tr("Thanks, noted as gone"), { duration: 2000 });
      onClose();
    } catch (e) {
      toast.error(e instanceof HazardError && e.reason === 'rate-limited' ? tr("Slow down on the votes a little") : tr("Couldn't send that"));
    }
  };
  return (
    <div className={cn('rounded-2xl border-2 bg-card/95 shadow-2xl backdrop-blur p-3 animate-slide-up', className)} style={{ borderColor: color }}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color }}>
          <type.icon className="w-5 h-5 text-white" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{type.label}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_BY_ID[type.category].label}{" "}{tr("· reported")}{" "}{ago(hazard.createdAt)}
            {hazard.confirmations > 0 ? tr(" · {0} confirmed", [hazard.confirmations]) : ''}
          </p>
        </div>
        <button className="p-1.5 -m-1 rounded-lg hover:bg-secondary" onClick={onClose} aria-label={tr("Close")}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-2.5 flex gap-2">
        {hazard.mine ? (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1"
            onClick={() => {
              void removeMyHazard(hazard.id).catch(() => toast.error(tr("Couldn't remove it")));
              toast(tr("Your report was removed"));
              onClose();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />{" "}{tr("Remove my report")}
          </Button>
        ) : hazard.myVote !== null ? (
          <p className="flex-1 text-xs text-muted-foreground text-center py-1.5">{hazard.myVote ? tr("You said it's still there. Thanks.") : tr("You said it's gone. Thanks.")}</p>
        ) : (
          <>
            <Button size="sm" className="flex-1 gap-1" onClick={() => void vote(true)}>
              <ThumbsUp className="w-3.5 h-3.5" />{" "}{tr("Still there")}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => void vote(false)}>
              <ThumbsDown className="w-3.5 h-3.5" />{" "}{tr("Gone")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
