import { useMemo, useState } from 'react';
import { Ghost } from 'lucide-react';
import type { SpectreCard } from '@/features/cards';
import { haptics } from '@/lib/haptics';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import { POWERS, type TagPower } from '../types';
import { spectreTag, tagName } from '../lib/tags';
import { DogTagPlate } from './DogTagPlate';
import { SpinReel } from './SpinReel';
import '../card-wars.css';

/**
 * The back of a Spectre card in the vault: the dog tag it gives in Card Wars.
 * The first time the card is turned over a wheel picks the tag's power; it's
 * kept with the Spectre from then on. Being earned on track, the tag has its
 * bonus with cars and bikes alike.
 */
export function SpectreTagBack({ spectre, shown, onAssign }: { spectre: SpectreCard; shown: boolean; onAssign: (power: TagPower) => void }) {
  // Decided once, when the card is first turned over, so the reel can't land on something else.
  const [landing, setLanding] = useState<TagPower | null>(null);
  const labels = useMemo(() => POWERS.map((p) => tagName(p)), []);
  if (!spectre.power && shown && !landing) setLanding(POWERS[Math.floor(Math.random() * POWERS.length)]);

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center gap-2 text-center">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-white/10 text-slate-100 border border-white/30 spectre-text">
        <Ghost className="w-3.5 h-3.5" /> {tr("Dog tag")}
      </span>
      {spectre.power ? (
        <DogTagPlate tag={spectreTag(spectre)} size="big" className="!mt-6 !w-full" />
      ) : landing ? (
        <>
          <p className="text-[10px] uppercase tracking-widest text-slate-200/80">{tr("Spinning for its power…")}</p>
          <SpinReel
            result={tagName(landing)}
            labels={labels}
            onDone={() => {
              haptics.success();
              eventSound('success');
              onAssign(landing);
            }}
          />
        </>
      ) : (
        <p className="text-[10px] uppercase tracking-widest text-slate-200/70">{tr("Turn the card over to spin for its power")}</p>
      )}
    </div>
  );
}
