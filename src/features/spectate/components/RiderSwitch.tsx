import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tr } from '@/lib/i18n';

/**
 * The followed rider's name, with arrows either side to move to the previous
 * or next rider and where in the convoy this one is ("2 of 4"). Used by the
 * spectator screen and the passenger's map, which cycle the same way.
 */
export function RiderSwitch({ name, index, total, onStep, tip }: { name: string; index: number; total: number; onStep: (by: number) => void; tip?: string }) {
  if (total < 2) return <p data-tip={tip} className="text-xl font-bold text-white truncate">{name}</p>;
  return (
    <div className="flex items-center gap-1 -ml-2">
      <button type="button" onClick={() => onStep(-1)} aria-label={tr("Previous rider")} className="glove-hit p-1.5 rounded-full text-white/80 hover:text-white">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="min-w-0">
        <p data-tip={tip} className="text-xl font-bold text-white truncate leading-tight">{name}</p>
        <p className="text-[10px] text-white/60 font-mono">{tr("{0} of {1}", [index + 1, total])}</p>
      </div>
      <button type="button" onClick={() => onStep(1)} aria-label={tr("Next rider")} className="glove-hit p-1.5 rounded-full text-white/80 hover:text-white">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
