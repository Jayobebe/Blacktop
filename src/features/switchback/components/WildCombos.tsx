import { useState } from 'react';
import { Bike, Car, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { wildTag } from '../lib/redline';
import { pickWildVersion, useShop } from '../lib/shop';
import { comboDescription, tagLabel } from '../lib/tags';

/**
 * A combo Wildcard a run of wins has just unlocked, waiting on the deck page
 * for its car or bike version to be chosen. Nothing shows otherwise: the
 * combos held are in the dog tag list, with the run towards the next one.
 */
export function WildCombos() {
  const on = useServerCap('switchbackCombos');
  const shop = useShop();
  const demo = useDemoLocked();
  const [busy, setBusy] = useState(false);
  const pending = shop.wildPending;
  if (!on || !shop.wildcard || !pending) return null;

  const pick = async (vehicle: 'car' | 'bike') => {
    setBusy(true);
    const ok = await pickWildVersion(vehicle);
    setBusy(false);
    if (!ok) return void toast.error(tr("Could not unlock it. Try again."));
    eventSound('success');
    toast.success(tr("Unlocked: {0}", [tagLabel(wildTag(pending, vehicle))]));
  };

  return (
    <section className="sb-panel sb-panel-redline">
      <div className="flex items-start gap-3">
        <div className="sb-emblem sb-emblem-sm sb-emblem-redline">
          <Sparkles />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr("Unlocked: {0}", [tagLabel(wildTag(pending, 'car'))])}</p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{comboDescription(pending)}</p>
        </div>
      </div>
      <p className="text-xs leading-snug">{tr("Choose its version. The combo works with that kind of card.")}</p>
      {demo && <DemoLockNote />}
      <div className="grid grid-cols-2 gap-2">
        {(['car', 'bike'] as const).map((v) => (
          <Button key={v} className="h-12 gap-2" disabled={busy || demo || shop.wildTags.includes(`${pending}.${v}`)} onClick={() => void pick(v)}>
            {v === 'car' ? <Car className="w-4 h-4" /> : <Bike className="w-4 h-4" />}
            {v === 'car' ? tr("Car") : tr("Bike")}
          </Button>
        ))}
      </div>
    </section>
  );
}
